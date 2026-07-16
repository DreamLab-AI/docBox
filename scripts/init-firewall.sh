#!/usr/bin/env bash
#
# init-firewall.sh — default-deny egress allowlist for the agent container.
#
# The egress allowlist is the load-bearing network control (foreman.toml
# network.egress_allowlist). This installs a deny-by-default OUTPUT firewall and
# opens only the listed domains, resolved to IPs and held in an ipset. It is our
# own implementation of the devcontainer egress-firewall pattern — no vendor code
# is copied.
#
# Runs at agent start with CAP_NET_ADMIN (granted narrowly in compose). It is
# idempotent: it flushes and rebuilds, so re-running it refreshes DNS drift.
# Schedule a periodic re-run if allowlisted hosts rotate IPs aggressively.
#
# Source of the allowlist, in order:
#   1. $EGRESS_ALLOWLIST         (space/comma separated)
#   2. egress_allowlist = [...]  in foreman.toml

set -euo pipefail

readonly FOREMAN_TOML="${FOREMAN_TOML:-/etc/docbox/foreman.toml}"
readonly IPSET_NAME="docbox-allow"
readonly DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
# Private ranges permitted for intra-stack traffic to the sidecars. Tighten to
# the actual agent-net subnet in production via INTERNAL_CIDRS.
readonly INTERNAL_CIDRS="${INTERNAL_CIDRS:-10.0.0.0/8 172.16.0.0/12 192.168.0.0/16}"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Print the allowlist, one domain per line, from env or foreman.toml.
read_allowlist() {
  if [[ -n "${EGRESS_ALLOWLIST:-}" ]]; then
    tr ', ' '\n\n' <<< "${EGRESS_ALLOWLIST}" | grep -v '^$'
    return
  fi
  [[ -f "${FOREMAN_TOML}" ]] || die "no EGRESS_ALLOWLIST and ${FOREMAN_TOML} absent"
  # Capture tokens inside the egress_allowlist = [ ... ] array and strip quotes.
  awk '
    /egress_allowlist[[:space:]]*=[[:space:]]*\[/ { grab = 1 }
    grab {
      while (match($0, /"[^"]+"/)) {
        tok = substr($0, RSTART + 1, RLENGTH - 2)
        print tok
        $0 = substr($0, RSTART + RLENGTH)
      }
      if ($0 ~ /\]/) { grab = 0 }
    }
  ' "${FOREMAN_TOML}"
}

# Resolve a hostname to its IPv4 addresses (getent first, dig as fallback).
resolve_ipv4() {
  local host="$1"
  if command -v getent >/dev/null; then
    getent ahostsv4 "${host}" 2>/dev/null | awk '{ print $1 }' | sort -u
  elif command -v dig >/dev/null; then
    dig +short A "${host}" 2>/dev/null | grep -E '^[0-9.]+$'
  fi
}

main() {
  command -v iptables >/dev/null || die "iptables not found"
  command -v ipset >/dev/null    || die "ipset not found"

  log "Building egress allowlist ipset"
  ipset create "${IPSET_NAME}" hash:ip family inet -exist
  ipset flush "${IPSET_NAME}"

  local domain ip count=0
  while IFS= read -r domain; do
    [[ -z "${domain}" ]] && continue
    while IFS= read -r ip; do
      [[ -z "${ip}" ]] && continue
      ipset add "${IPSET_NAME}" "${ip}" -exist
      count=$((count + 1))
    done < <(resolve_ipv4 "${domain}")
    ok "allowed ${domain}"
  done < <(read_allowlist)
  ok "ipset ${IPSET_NAME} holds ${count} address(es)"

  log "Installing IPv4 OUTPUT rules (default deny)"
  # Resolution above ran while egress was still open; now lock down.
  iptables -F OUTPUT
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  # DNS to the permitted resolver only (needed for runtime re-resolution).
  iptables -A OUTPUT -p udp --dport 53 -d "${DNS_SERVER}" -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d "${DNS_SERVER}" -j ACCEPT
  # Intra-stack traffic to the sidecars over the private docker networks.
  local cidr cidrs
  read -ra cidrs <<< "${INTERNAL_CIDRS}"
  for cidr in "${cidrs[@]}"; do
    iptables -A OUTPUT -d "${cidr}" -j ACCEPT
  done
  # The allowlist itself.
  iptables -A OUTPUT -m set --match-set "${IPSET_NAME}" dst -j ACCEPT
  # Everything else is denied.
  iptables -P OUTPUT DROP
  ok "IPv4 egress locked to the allowlist"

  # Deny ALL IPv6 egress so the v4 allowlist cannot be bypassed over v6. Extend
  # with a v6 ipset if IPv6 destinations are ever required.
  if command -v ip6tables >/dev/null; then
    log "Denying IPv6 egress"
    ip6tables -F OUTPUT
    ip6tables -A OUTPUT -o lo -j ACCEPT
    ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    ip6tables -P OUTPUT DROP
    ok "IPv6 egress denied"
  else
    warn "ip6tables not present — ensure IPv6 is disabled in the container"
  fi

  log "Egress firewall active"
}

main "$@"
