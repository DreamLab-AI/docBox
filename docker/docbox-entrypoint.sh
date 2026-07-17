#!/usr/bin/env bash
#
# docbox-entrypoint.sh — startup wrapper for the sandbox/agent image.
#
# It does two things, in order, then hands control to the real workload:
#   1. Applies the default-deny egress firewall (scripts/init-firewall.sh) while
#      still running as root with the scoped CAP_NET_ADMIN the compose `agent`
#      service grants. This is the "apply then drop" model: the capability is
#      used once at startup to install the iptables/ipset rules, then discarded.
#   2. Drops to the unprivileged `dev` user (via setpriv, clearing inheritable
#      capabilities) and execs the container command. code-server, pi and every
#      tool therefore run with no capabilities at all.
#
# The firewall is gated on DOCBOX_EGRESS_FIREWALL (default 1, secure-by-default):
#   1  → enforce. If the rules cannot be installed (not root, or CAP_NET_ADMIN
#        absent) the container REFUSES to start — fail closed, never run an agent
#        with unshaped egress.
#   0  → skip. Used by one-off, network-free invocations of this image, e.g. the
#        read-only data-compatibility probe in scripts/rebuild.sh.
#
# tini is PID 1 (see the image ENTRYPOINT); this script runs under it, so signals
# and zombie reaping are handled for the whole exec chain.

set -euo pipefail

readonly RUN_AS_USER="${DOCBOX_RUN_AS:-dev}"
readonly FIREWALL="${DOCBOX_EGRESS_FIREWALL:-1}"
readonly FIREWALL_SCRIPT="/usr/local/sbin/init-firewall.sh"

if [[ "${FIREWALL}" != "0" ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    printf '✗ egress firewall requested (DOCBOX_EGRESS_FIREWALL=%s) but not running as root — refusing to start\n' \
      "${FIREWALL}" >&2
    exit 1
  fi
  [[ -x "${FIREWALL_SCRIPT}" ]] || { printf '✗ %s missing or not executable\n' "${FIREWALL_SCRIPT}" >&2; exit 1; }
  # set -e propagates a failure here: no rules ⇒ no start (fail closed).
  "${FIREWALL_SCRIPT}"
fi

# Drop privileges for the actual workload. setpriv (util-linux) re-execs as the
# unprivileged user with a clean group set and no inheritable capabilities.
if [[ "$(id -u)" -eq 0 ]]; then
  exec setpriv --reuid "${RUN_AS_USER}" --regid "${RUN_AS_USER}" --init-groups --inh-caps=-all -- "$@"
fi

# Already unprivileged (e.g. firewall skipped in a non-root context): run as-is.
exec "$@"
