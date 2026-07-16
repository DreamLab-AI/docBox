#!/usr/bin/env bash
#
# rollback.sh — post-cutover rollback of the docBox stack.
#
# Blue/green makes rollback cheap (corpus/10-architecture/snapshot-rollback.md):
# re-point the live project at a RETAINED prior image tag and revert the
# System-Definition git commit. Seconds, no rebuild. This is the SYSTEM-DEFINITION
# plane only — it never touches the User-Data or Audit planes (user-data restore
# is a separate, guarded, human-confirmed operation; audit is view-only WORM).
#
# The rollback itself is a recorded SYSTEM_EVENT, never an erasure of the trail.
#
#   ./rollback.sh                 # roll back to the tag in docker/.last-good-tag
#   ./rollback.sh <tag> [<sha>]   # roll back to an explicit image tag (+ optional git revert to <sha>)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly DOCKER_DIR="${SCRIPT_DIR}/../docker"
readonly REPO_DIR="${SCRIPT_DIR}/.."
readonly COMPOSE_FILE="${DOCKER_DIR}/compose.yaml"
readonly ENV_FILE="${DOCKER_DIR}/.env"
readonly LIVE_PROJECT="${LIVE_PROJECT:-docbox}"
readonly LAST_GOOD_FILE="${DOCKER_DIR}/.last-good-tag"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

main() {
  local tag="${1:-}"
  local revert_sha="${2:-}"

  command -v docker >/dev/null || die "docker not found"
  [[ -f "${COMPOSE_FILE}" ]] || die "missing ${COMPOSE_FILE}"
  [[ -f "${ENV_FILE}" ]]     || die "missing ${ENV_FILE}"

  # Resolve the target tag: explicit arg, else the retained prior tag.
  if [[ -z "${tag}" ]]; then
    [[ -f "${LAST_GOOD_FILE}" ]] || die "no tag given and ${LAST_GOOD_FILE} is absent"
    tag="$(< "${LAST_GOOD_FILE}")"
  fi
  [[ -n "${tag}" ]] || die "empty rollback tag"

  log "Phase 1 · re-point live stack to image tag ${tag}"
  DOCBOX_TAG="${tag}" \
    docker compose -p "${LIVE_PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    up -d
  ok "live stack re-pointed to ${tag}"

  # Optionally revert the System-Definition git commit so the source matches the
  # rolled-back image. --no-edit keeps it non-interactive; this repo is the
  # rollback target plane, so a revert here is expected and audited.
  if [[ -n "${revert_sha}" ]]; then
    log "Phase 2 · git revert System-Definition to ${revert_sha}"
    git -C "${REPO_DIR}" revert --no-edit "${revert_sha}..HEAD"
    ok "System-Definition reverted"
  else
    log "Phase 2 · git revert skipped (no SHA given)"
  fi

  log "ROLLBACK COMPLETE — live on ${tag}. Record this as a SYSTEM_EVENT in the audit trail."
}

main "$@"
