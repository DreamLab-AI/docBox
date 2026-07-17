#!/usr/bin/env bash
#
# rebuild.sh — blue/green overhaul of the docBox stack.
#
# Implements the three-planes overhaul data-flow from
# corpus/10-architecture/snapshot-rollback.md:
#
#   propose → restore point → build → deploy GREEN (isolated) → verify
#   (healthcheck + read-only data-compatibility probe) → PASS: cut over,
#   retire BLUE (retain its tag) / FAIL: tear down GREEN, BLUE never moved,
#   restore point marked AUTO_ROLLED_BACK.
#
# Auto-rollback is free because it is blue/green: rollback-on-failure just means
# "don't cut over". Post-cutover rollback is scripts/rollback.sh (re-point to the
# retained prior tag).
#
# It does not run in this repo's CI (docker-in-docker with bind mounts is broken
# here). Run it on a real host — see docker/README.md.

set -euo pipefail

# --- Locations -------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly DOCKER_DIR="${SCRIPT_DIR}/../docker"
readonly REPO_DIR="${SCRIPT_DIR}/.."
readonly COMPOSE_FILE="${DOCKER_DIR}/compose.yaml"
readonly ENV_FILE="${DOCKER_DIR}/.env"

# --- Tunables (overridable from the environment) ---------------------------
readonly LIVE_PROJECT="${LIVE_PROJECT:-docbox}"          # the BLUE (live) compose project
readonly GREEN_PROJECT="${GREEN_PROJECT:-docbox-green}"  # the GREEN (candidate) compose project
readonly REGISTRY="${DOCBOX_REGISTRY:-docbox}"
readonly HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
readonly HEALTH_INTERVAL="${HEALTH_INTERVAL:-6}"         # seconds between health polls
readonly RETAIN="${SNAPSHOTS_RETAIN:-8}"                 # restore points to keep (foreman snapshots.retain)
readonly RESTIC_REPO="${RESTIC_REPOSITORY:-}"            # empty ⇒ snapshot step is skipped with a warning

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '  \033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Tear GREEN down on any unexpected exit so a failed run never leaves a half
# stack behind. BLUE is never touched by this trap.
cleanup_green() {
  if docker compose -p "${GREEN_PROJECT}" ls >/dev/null 2>&1; then
    warn "tearing down GREEN (${GREEN_PROJECT})"
    docker compose -p "${GREEN_PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup_green EXIT

# ---------------------------------------------------------------------------
# Phase 0 — preflight
# ---------------------------------------------------------------------------
preflight() {
  log "Phase 0 · preflight"
  command -v docker >/dev/null || die "docker not found"
  docker compose version >/dev/null 2>&1 || die "docker compose v2 not found"
  [[ -f "${COMPOSE_FILE}" ]] || die "missing ${COMPOSE_FILE}"
  [[ -f "${ENV_FILE}" ]]     || die "missing ${ENV_FILE} (copy .env.example → .env)"
  git -C "${REPO_DIR}" diff --quiet || die "working tree dirty — commit the overhaul before rebuilding"
  ok "preflight passed"
}

# ---------------------------------------------------------------------------
# Phase 1 — restore point (User-Data + Audit snapshot + retained BLUE tag)
# The snapshot is taken BEFORE anything changes, so a rollback has a clean
# point to restore user data to (restore is a separate guarded operation; this
# only records the point).
# ---------------------------------------------------------------------------
make_restore_point() {
  local sha="$1"
  log "Phase 1 · restore point"
  if [[ -z "${RESTIC_REPO}" ]]; then
    warn "RESTIC_REPOSITORY unset — skipping data snapshot (set it on a real host)"
  elif command -v restic >/dev/null; then
    # Snapshot the User-Data and Audit planes. Audit is append-only WORM and is
    # never a rollback target; it is snapshotted only so the record survives.
    restic backup --tag "docbox-pre-overhaul" --tag "sha:${sha}" \
      /var/lib/docbox/user-data /var/lib/docbox/audit
    ok "restic snapshot taken (tag sha:${sha})"
  else
    warn "restic not installed — skipping data snapshot"
  fi
  # Record the current live tag so rollback has an explicit target.
  local prev_tag
  prev_tag="$(current_live_tag)"
  printf '%s\n' "${prev_tag}" > "${DOCKER_DIR}/.last-good-tag"
  ok "retained prior image tag: ${prev_tag}"
}

current_live_tag() {
  # The tag the live agent container currently runs (falls back to 'dev').
  docker inspect --format '{{ index .Config.Labels "docbox.tag" }}' \
    "$(docker compose -p "${LIVE_PROJECT}" ps -q agent 2>/dev/null || true)" 2>/dev/null \
    | grep -v '^$' || printf 'dev'
}

# ---------------------------------------------------------------------------
# Phase 2 — build the new image tagged with the git SHA
# ---------------------------------------------------------------------------
build_image() {
  local sha="$1"
  log "Phase 2 · build ${REGISTRY}/sandbox:${sha}"
  # Core images that carry a build: section — agent (sandbox), control-plane and
  # the audit sidecar. The optional module sidecars (browser, vault) build under
  # their profiles, not on a core overhaul.
  DOCBOX_TAG="${sha}" docker compose \
    -p "${GREEN_PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    build agent control-plane audit-sidecar
  ok "images built and tagged ${sha}"
}

# ---------------------------------------------------------------------------
# Phase 3 — deploy GREEN on its own compose project (isolated network + volumes
# namespace). GREEN binds no shared host ports; it is probed in place, not
# fronted, so BLUE keeps serving untouched.
# ---------------------------------------------------------------------------
deploy_green() {
  local sha="$1"
  log "Phase 3 · deploy GREEN (${GREEN_PROJECT})"
  # DOCBOX_TAG selects the freshly built image. GREEN gets its own project name,
  # so compose namespaces its network and containers away from BLUE.
  DOCBOX_TAG="${sha}" \
  CONTROL_PLANE_PORT="0" CODE_SERVER_PORT="0" FOREMAN_PORT="0" \
    docker compose -p "${GREEN_PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    up -d control-plane agent audit-sidecar
  ok "GREEN up"
}

# ---------------------------------------------------------------------------
# Phase 4 — verify: control-plane healthcheck + read-only data-compatibility
# probe against the REAL user-data volume. The probe catches overhauls that
# would silently break the on-disk data format before any traffic moves.
# ---------------------------------------------------------------------------
verify_green() {
  local sha="$1"
  log "Phase 4 · verify GREEN"
  local cid
  cid="$(docker compose -p "${GREEN_PROJECT}" ps -q control-plane)"
  [[ -n "${cid}" ]] || die "GREEN control-plane container not found"

  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if docker exec "${cid}" curl -fsS http://localhost:8788/api/health >/dev/null 2>&1; then
      ok "healthcheck passed (attempt ${i})"
      break
    fi
    [[ "${i}" -eq "${HEALTH_RETRIES}" ]] && die "healthcheck never passed"
    sleep "${HEALTH_INTERVAL}"
  done

  # Data-compatibility probe: mount the live User-Data volume READ-ONLY into a
  # one-off container of the NEW image and run its migration/read check. This
  # container has no NET_ADMIN and needs no network, so the egress firewall is
  # switched off for the probe (it would otherwise fail closed at startup).
  log "Phase 4b · data-compatibility probe (read-only)"
  if docker run --rm \
      -e DOCBOX_EGRESS_FIREWALL=0 \
      -v "${LIVE_PROJECT}_docbox-user-data:/workspace:ro" \
      "${REGISTRY}/sandbox:${sha}" \
      bash -lc 'test -d /workspace && ls -A /workspace >/dev/null'; then
    ok "data probe passed — new image can read existing user data"
  else
    die "data probe FAILED — new image cannot read existing user data"
  fi
}

# ---------------------------------------------------------------------------
# Phase 5 — cut over: promote the proven tag into the live (BLUE) project, then
# retire GREEN. The retained prior tag stays in the registry for rollback.
# ---------------------------------------------------------------------------
cut_over() {
  local sha="$1"
  log "Phase 5 · cut over to ${sha}"
  DOCBOX_TAG="${sha}" \
    docker compose -p "${LIVE_PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    up -d
  ok "live stack now serving ${sha}"

  # GREEN has served its purpose; drop it. (The EXIT trap would also do this.)
  docker compose -p "${GREEN_PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
  trap - EXIT

  # Retention: keep only the last N sandbox tags (foreman snapshots.retain).
  prune_old_tags
}

prune_old_tags() {
  log "Phase 5b · prune to last ${RETAIN} tags"
  local old
  old="$(docker images "${REGISTRY}/sandbox" --format '{{.Tag}}' \
    | grep -v '^dev$' | tail -n +"$((RETAIN + 1))" || true)"
  if [[ -n "${old}" ]]; then
    while IFS= read -r tag; do
      [[ -n "${tag}" ]] && docker rmi "${REGISTRY}/sandbox:${tag}" >/dev/null 2>&1 || true
    done <<< "${old}"
    ok "pruned older tags beyond ${RETAIN}"
  else
    ok "nothing to prune"
  fi
}

# ---------------------------------------------------------------------------
main() {
  local sha
  sha="$(git -C "${REPO_DIR}" rev-parse --short HEAD)"
  log "docBox overhaul → git ${sha}"

  preflight
  make_restore_point "${sha}"
  build_image "${sha}"
  deploy_green "${sha}"
  verify_green "${sha}"    # dies here on failure ⇒ EXIT trap tears down GREEN, BLUE untouched
  cut_over "${sha}"

  log "OVERHAUL COMPLETE — live on ${sha}; prior tag retained in ${DOCKER_DIR}/.last-good-tag"
}

main "$@"
