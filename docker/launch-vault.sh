#!/usr/bin/env bash
#
# launch-vault.sh — unlock a gocryptfs cipherdir and keep the plaintext FUSE
# mount live in the foreground. This is the entry point of the vault-sidecar
# image (docker/Dockerfile.vault). It holds no application logic: it mounts, then
# blocks on the mount process so the container's lifetime IS the mount's lifetime.
#
# Passphrase source, in order:
#   1. $VAULT_PASSFILE   — path to a mounted secret file (preferred; a docker
#                          secret, or a read-only bind of a KMS-materialised file)
#   2. $VAULT_PASSPHRASE — the passphrase in the environment. It is copied once to
#                          a mode-600 file on the RAM-backed /tmp (compose mounts
#                          tmpfs there), never to persistent storage.
#
# Cipherdir / mountpoint come from $VAULT_CIPHERDIR and $VAULT_MOUNTPOINT (the
# image ships defaults under the docbox-vaults volume). A cipherdir with no
# gocryptfs.conf is initialised once with the same passphrase unless
# VAULT_INIT=0, so a fresh vault works on first start.

set -euo pipefail

readonly CIPHERDIR="${VAULT_CIPHERDIR:-/vaults/default/cipher}"
readonly MOUNTPOINT="${VAULT_MOUNTPOINT:-/vaults/default/plain}"
readonly INIT="${VAULT_INIT:-1}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Resolve the passphrase to a readable file path. When it comes from the
# environment, materialise it on the RAM-backed /tmp with tight permissions so it
# never touches persistent storage. That copy lives on tmpfs (RAM) for the
# mount's lifetime and is gone when the container stops — the same exposure as the
# environment variable it came from, and nothing lands on disk.
resolve_passfile() {
  if [[ -n "${VAULT_PASSFILE:-}" ]]; then
    [[ -r "${VAULT_PASSFILE}" ]] || die "VAULT_PASSFILE=${VAULT_PASSFILE} is not readable"
    printf '%s' "${VAULT_PASSFILE}"
    return
  fi
  [[ -n "${VAULT_PASSPHRASE:-}" ]] || die "no passphrase: set VAULT_PASSFILE (a mounted secret) or VAULT_PASSPHRASE"
  local pf
  pf="$(umask 077 && mktemp /tmp/vault-pass.XXXXXX)"
  printf '%s' "${VAULT_PASSPHRASE}" > "${pf}"
  printf '%s' "${pf}"
}

main() {
  command -v gocryptfs >/dev/null || die "gocryptfs not found in image"

  mkdir -p "${CIPHERDIR}" "${MOUNTPOINT}"

  local passfile
  passfile="$(resolve_passfile)"

  if [[ ! -f "${CIPHERDIR}/gocryptfs.conf" ]]; then
    [[ "${INIT}" == "0" ]] && die "cipherdir ${CIPHERDIR} is not initialised and VAULT_INIT=0"
    log "Initialising gocryptfs cipherdir ${CIPHERDIR}"
    gocryptfs -init -passfile "${passfile}" -- "${CIPHERDIR}"
    ok "cipherdir initialised"
  fi

  log "Mounting ${CIPHERDIR} → ${MOUNTPOINT} (foreground)"
  # -fg keeps gocryptfs in the foreground so tini supervises it and the mount
  # lives exactly as long as the container. -allow_other lets the agent read the
  # plaintext across the shared, scoped mount propagation compose configures.
  exec gocryptfs -fg -allow_other -passfile "${passfile}" -- "${CIPHERDIR}" "${MOUNTPOINT}"
}

main "$@"
