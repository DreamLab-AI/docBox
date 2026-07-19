#!/usr/bin/env bash
# docBox — guided launcher.
#
# Walks a newcomer up the three rungs (docs/mock-to-live.md) and writes dev env
# config. Pure bash + coreutils + node + pnpm + curl; no new dependencies.
#
#   ./scripts/launch.sh                 guided interactive menu (TTY)
#   ./scripts/launch.sh <command> [opts]
#
# Commands: demo · dev · real · up · companion · host · doctor · configure
# Every command accepts --print (show what would run, run nothing). See --help.
#
# This configures the DEV run only. The container is configured in
# docker/foreman.toml (Foreman's Configuration tab), never here.
set -euo pipefail

# ── Location ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.docbox"

# ── Colour (only on a TTY, honour NO_COLOR) ──────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; CYA=$'\033[36m'
else
  BOLD=""; DIM=""; RESET=""; RED=""; GRN=""; YEL=""; CYA=""
fi

# ── Small printers ───────────────────────────────────────────────────────────
heading() { printf '\n%s%s%s\n\n' "$BOLD" "$1" "$RESET"; }
plan()    { printf '  %s$%s %s\n' "$DIM" "$RESET" "$*"; }
ok()      { printf '  %s\xe2\x9c\x94%s %s\n' "$GRN" "$RESET" "$*"; }
note()    { printf '  %s%s%s\n' "$DIM" "$*" "$RESET"; }
warn()    { printf '  %s!%s %s\n' "$YEL" "$RESET" "$*" >&2; }
err()     { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; }
interactive_ok() { [ -t 0 ] && [ -t 1 ]; }

# ── Argument parsing ─────────────────────────────────────────────────────────
SUB=""
PRINT=0
STRICT=0
HELP=0
SETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --print)  PRINT=1 ;;
    --strict) STRICT=1 ;;
    --set)    shift; [ $# -gt 0 ] || { err "--set needs KEY=VALUE"; exit 2; }; SETS+=("$1") ;;
    --set=*)  SETS+=("${1#--set=}") ;;
    -h|--help) HELP=1 ;;
    --)       shift; break ;;
    -*)       err "unknown option: $1"; exit 2 ;;
    *)        if [ -z "$SUB" ]; then SUB="$1"; else err "unexpected argument: $1"; exit 2; fi ;;
  esac
  shift
done

# ── Config file: source the dev env if present ───────────────────────────────
SOURCED_ENV=0
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  SOURCED_ENV=1
fi
SERVER_PORT="${PORT:-8787}"

# Required Node major from the root package.json engines field.
read_engine_node() {
  if command -v node >/dev/null 2>&1; then
    node -e 'try{process.stdout.write(String(require(process.argv[1]).engines.node||""))}catch(e){}' \
      "$REPO_ROOT/package.json" 2>/dev/null || true
  fi
}
ENGINE_NODE="$(read_engine_node)"
[ -n "${ENGINE_NODE:-}" ] || ENGINE_NODE=">=24"

# ── Usage ────────────────────────────────────────────────────────────────────
usage_top() {
  cat <<EOF
${BOLD}docBox launcher${RESET} — guided dev launch + config

Usage:
  scripts/launch.sh                 guided interactive menu (on a TTY)
  scripts/launch.sh <command> [opts]

Commands:
  demo         offline mock world (pnpm dev:app)            -> http://localhost:5173
  dev          dev-live, seeded: server + VITE_DATA_MODE=live UI
  real         dev-live, REAL store: DOCBOX_DATA=real server + live UI
  up           one-port built: pnpm build then real server on ${SERVER_PORT} (+ /bubble)
  companion    print the code-server Companion + bubble steps (starts nothing)
  host         print the docker compose sequence (starts nothing; never runs here)
  doctor       environment check (PASS/WARN table)
  configure    write the git-ignored .env.docbox dev config

Options:
  --print      show what a command would run, run nothing (CI-safe)
  --strict     doctor only: turn any WARN into a non-zero exit
  --set K=V    configure only: set a key non-interactively (repeatable)
  -h, --help   this help; after a command, that command's help

Config: the launcher sources ./.env.docbox when present. It configures the DEV
run only; the container is configured in docker/foreman.toml (Foreman's
Configuration tab), never here.
EOF
}

usage_sub() {
  case "$1" in
    demo) cat <<EOF
demo — offline mock world, no server.
  Runs:  pnpm dev:app          -> http://localhost:5173
  Data:  seeded (fabricated demo world; nothing is real). Stop with Ctrl-C.
  --print shows the command without running it.
EOF
      ;;
    dev) cat <<EOF
dev — dev-live (seeded): control-plane server + live UI, two processes.
  Server (bg):  env DOCBOX_DATA=seed pnpm dev:server  -> http://127.0.0.1:${SERVER_PORT}
  UI (fg):      env VITE_DATA_MODE=live pnpm dev:app  -> http://localhost:5173
  Transport is live; /api/world still reports dataSource: "seeded".
  Ctrl-C stops the UI; the background server is stopped automatically.
  --print shows both commands without running them.
EOF
      ;;
    real) cat <<EOF
real — dev-live (REAL store): server on the real JSON-file store + live UI.
  Server (bg):  env DOCBOX_DATA=real pnpm dev:server  -> http://127.0.0.1:${SERVER_PORT}
  UI (fg):      env VITE_DATA_MODE=live pnpm dev:app  -> http://localhost:5173
  The store starts empty; Overview shows the first-project card. Provision to
  begin the real record. Ctrl-C stops the UI; the server is stopped automatically.
  --print shows both commands without running them.
EOF
      ;;
    up) cat <<EOF
up — one-port (built): compiled UI + real store on a single port.
  Runs:  pnpm build   then   env DOCBOX_DATA=real pnpm start
  URLs:  Foreman  http://127.0.0.1:${SERVER_PORT}
         Bubble   http://127.0.0.1:${SERVER_PORT}/bubble   (embeddable chat widget)
  Real (empty) store until you provision. Stop with Ctrl-C.
  --print shows the commands without running them.
EOF
      ;;
    companion) cat <<EOF
companion — print the code-server Companion + bubble surface steps.
  Starts nothing (code-server does not run in this dev box). Prints the build,
  package and install steps from extension/README.md and the /bubble URLs.
EOF
      ;;
    host) cat <<EOF
host — print the docker compose sequence for the full container stack.
  Starts nothing and never runs docker here (bind-mount DinD limitation).
  Prints the build/run sequence and defers to docker/README.md.
EOF
      ;;
    doctor) cat <<EOF
doctor — read-only environment check (PASS/WARN table).
  Checks node + version vs engines (${ENGINE_NODE}), pnpm, node_modules,
  app/dist, ports 5173/${SERVER_PORT}, .env.docbox, and echoes DOCBOX_DATA/ENGINE.
  Exit 0 always, unless --strict and any WARN (then non-zero).
  --print lists the checks without probing.
EOF
      ;;
    configure) cat <<EOF
configure — write the git-ignored .env.docbox dev config.
  Keys: DOCBOX_DATA (seed|real), DOCBOX_DATA_DIR, DOCBOX_ENGINE (mock|live),
        PORT, VITE_DATA_MODE (mock|live).
  Interactive on a TTY (current values as defaults), or non-interactive with
  --set KEY=VALUE (repeatable). --print shows the file without writing it.
  Does NOT touch docker/foreman.toml (that is Foreman's Configuration-tab seam).
EOF
      ;;
    *) err "no help for unknown command: $1"; usage_top ;;
  esac
}

# ── Interactive menu ─────────────────────────────────────────────────────────
show_banner() {
  cat <<EOF
${BOLD}docBox — guided launcher${RESET}
${DIM}Mock -> live, three rungs (docs/mock-to-live.md):${RESET}
  1. Demo (now)  - the fabricated world, fully offline.
  2. Dev-live    - VITE_DATA_MODE=live over the dev server: live transport, seeded data.
  3. Host        - a real datastore and control plane (M3-M6); only then is the data real.
EOF
}

show_menu() {
  cat <<EOF

Choose a rung:
  1) Demo - offline mock world              -> http://localhost:5173
  2) Dev-live (seeded) - server + live UI    -> 5173 UI - ${SERVER_PORT} server
  3) Dev-live (REAL)   - real JSON store     -> first-project card, real record
  4) One-port (built)  - compiled UI + real  -> http://127.0.0.1:${SERVER_PORT} (+ /bubble)
  5) Companion - code-server extension steps + bubble URL
  6) Host stack - docker compose sequence (printed; never run here)
  d) Doctor only    c) Configure    q) Quit
EOF
}

interactive() {
  while true; do
    show_banner
    show_menu
    printf '\n%sSelect:%s ' "$BOLD" "$RESET"
    local choice=""
    read -r choice || { printf '\n'; return 0; }
    case "$choice" in
      1) mode_demo; return 0 ;;
      2) mode_dev;  return 0 ;;
      3) mode_real; return 0 ;;
      4) mode_up;   return 0 ;;
      5) mode_companion ;;
      6) mode_host ;;
      d|D) mode_doctor || true ;;
      c|C) mode_configure ;;
      q|Q|"") return 0 ;;
      *) warn "unknown choice: $choice" ;;
    esac
    printf '\n%sPress Enter to return to the menu...%s' "$DIM" "$RESET"
    read -r _ || { printf '\n'; return 0; }
    printf '\n'
  done
}

# ── Two-process runner (server bg, UI fg, stop server on exit) ────────────────
SERVER_PID=""
stop_server() {
  trap - EXIT INT TERM
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    printf '\n%s\xe2\x96\xa0 stopping the background server (PID %s)...%s\n' "$YEL" "$SERVER_PID" "$RESET"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
run_pair() {
  local -n _server="$1"
  local -n _ui="$2"
  cd "$REPO_ROOT"
  "${_server[@]}" &
  SERVER_PID=$!
  trap 'stop_server' EXIT INT TERM
  printf '\n%s\xe2\x96\xb6 server started, PID %s (stopped automatically on exit)%s\n\n' \
    "$CYA" "$SERVER_PID" "$RESET"
  "${_ui[@]}"
}

# ── Modes ────────────────────────────────────────────────────────────────────
mode_demo() {
  heading "Demo - offline mock world"
  cat <<EOF
  Runs the deterministic mock world in the browser. No server, fully offline.
  Data:  seeded (fabricated demo world - nothing is real until you go live).
  URL:   http://localhost:5173
  Stop:  Press Ctrl-C.
EOF
  local cmd=(pnpm dev:app)
  plan "${cmd[@]}"
  if [ "$PRINT" = 1 ]; then return 0; fi
  cd "$REPO_ROOT"
  "${cmd[@]}"
}

mode_dev() {
  heading "Dev-live (seeded) - server + live UI"
  cat <<EOF
  Two processes: the control-plane server (background) and the Vite UI
  (foreground, VITE_DATA_MODE=live). The UI hydrates over HTTP + SSE, but the
  server serves the seeded mock world, so /api/world reports dataSource: "seeded".
  Data:  transport is live; the world is still seeded.
  URLs:  server  http://127.0.0.1:${SERVER_PORT}
         UI      http://localhost:5173
  Stop:  Ctrl-C stops the UI; the background server is stopped automatically.
EOF
  local server=(env DOCBOX_DATA=seed pnpm dev:server)
  local ui=(env VITE_DATA_MODE=live pnpm dev:app)
  plan "${server[@]}"
  plan "${ui[@]}"
  if [ "$PRINT" = 1 ]; then return 0; fi
  run_pair server ui
}

mode_real() {
  heading "Dev-live (REAL) - real JSON store + live UI"
  cat <<EOF
  Same two processes as dev, but DOCBOX_DATA=real: the server serves the real
  (initially empty) JSON-file store instead of the seeded mock. /api/world reports
  dataSource: "real", the demo strip erases, and Overview shows the first-project
  card. Name a project and provision it to begin the real record.
  Data:  real (empty store until you provision).
  URLs:  server  http://127.0.0.1:${SERVER_PORT}
         UI      http://localhost:5173
  Stop:  Ctrl-C stops the UI; the background server is stopped automatically.
EOF
  local server=(env DOCBOX_DATA=real pnpm dev:server)
  local ui=(env VITE_DATA_MODE=live pnpm dev:app)
  plan "${server[@]}"
  plan "${ui[@]}"
  if [ "$PRINT" = 1 ]; then return 0; fi
  run_pair server ui
}

mode_up() {
  heading "One-port (built) - compiled UI + real store on one port"
  cat <<EOF
  Builds the UI (pnpm build -> app/dist), then runs the server with
  DOCBOX_DATA=real serving both the compiled UI and the API on a single port.
  First run shows the first-project card (empty real store); provision to begin
  the real record.
  Data:  real (empty JSON-file store until you provision).
  URLs:  Foreman  http://127.0.0.1:${SERVER_PORT}
         Bubble   http://127.0.0.1:${SERVER_PORT}/bubble   (embeddable chat widget, M7)
  Stop:  Press Ctrl-C.
EOF
  local build=(pnpm build)
  local start=(env DOCBOX_DATA=real pnpm start)
  plan "${build[@]}"
  plan "${start[@]}"
  if [ "$PRINT" = 1 ]; then return 0; fi
  cd "$REPO_ROOT"
  printf '\n%s\xe2\x96\xb6 building the UI...%s\n' "$CYA" "$RESET"
  "${build[@]}"
  printf '\n%s\xe2\x96\xb6 starting the one-port server...%s\n\n' "$CYA" "$RESET"
  "${start[@]}"
}

mode_companion() {
  heading "Companion - the primary user's code-server surface"
  cat <<EOF
  The Companion is a code-server (VS Code web) sidebar extension: a Chat view and
  a Documents view onto this control-plane server. It cannot run in this dev box
  (no code-server here); it is compile-checked and loaded on a real box.

  Build + package (from extension/):
    \$ cd extension
    \$ npm install
    \$ npm run compile          # tsc --noEmit - the compile gate
    \$ npm run build            # esbuild -> out/extension.js
    \$ npx vsce package         # -> docbox-companion-0.1.0.vsix

  Load into a running code-server:
    \$ code-server --install-extension docbox-companion-0.1.0.vsix
      (or drop the built folder into ~/.local/share/code-server/extensions/)
    Reload the window -> a docBox icon appears with Chat + Documents.
    Set docbox.controlPlaneUrl if the control plane is not on the default
    origin (default http://127.0.0.1:${SERVER_PORT}).

  Bubble surface (the embeddable alternative): run rung 4 (scripts/launch.sh up)
  and open:
    Demo page : http://127.0.0.1:${SERVER_PORT}/bubble
    Script    : http://127.0.0.1:${SERVER_PORT}/bubble.js
  Details: extension/README.md and docs/reference/adr/ADR-007-primary-user-surface.md.
EOF
}

mode_host() {
  heading "Host stack - the full container deployment"
  cat <<EOF
  The container images build on a real host or a Docker-capable CI runner, never
  in this dev box (bind-mount DinD limitation). This launcher never runs docker;
  it prints the sequence and defers to docker/README.md.

  On a real host:
    \$ cd docker
    \$ cp .env.example .env       # fill in provider keys, Entra IDs, cookie secret
    \$ docker compose build       # core images: agent, control-plane, audit
    \$ docker compose up -d       # base stack + oauth2-proxy

  Reach it:
    Foreman        https://127.0.0.1:8443   (oauth2-proxy -> control-plane)
    Control plane  http://127.0.0.1:8788    (loopback, behind the proxy)

  With the tunnel (zero inbound ports):
    \$ docker compose -f compose.yaml -f compose.tunnel.yaml up -d

  Full sequence, profiles, egress firewall and network boundary: docker/README.md.
EOF
}

# ── doctor ───────────────────────────────────────────────────────────────────
DOCTOR_PASS=0
DOCTOR_WARN=0
drow() {
  local result="$1" check="$2" detail="$3" colour=""
  case "$result" in
    PASS) colour="$GRN"; DOCTOR_PASS=$((DOCTOR_PASS + 1)) ;;
    WARN) colour="$YEL"; DOCTOR_WARN=$((DOCTOR_WARN + 1)) ;;
    INFO) colour="$CYA" ;;
  esac
  printf '  %-26s %s%-6s%s %s\n' "$check" "$colour" "$result" "$RESET" "$detail"
}
port_status() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}\$"; then
      echo listening
    else
      echo free
    fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo listening; else echo free; fi
  else
    echo unknown
  fi
}
mode_doctor() {
  heading "doctor - environment check"
  if [ "$PRINT" = 1 ]; then
    cat <<EOF
  Checks (read-only; --print runs none of them):
    - node present and major version vs package.json engines (${ENGINE_NODE})
    - pnpm present
    - dependencies installed (node_modules)
    - app/dist present (else http://127.0.0.1:${SERVER_PORT}/ serves the API only - a 404 on /)
    - ports 5173 (Vite UI) and ${SERVER_PORT} (server) not already listening
    - .env.docbox present (dev env config from 'configure')
    - DOCBOX_DATA / DOCBOX_ENGINE echo
  --strict turns any WARN into a non-zero exit.
EOF
    return 0
  fi

  DOCTOR_PASS=0
  DOCTOR_WARN=0
  printf '  %-26s %-6s %s\n' "CHECK" "RESULT" "DETAIL"
  printf '  %-26s %-6s %s\n' "--------------------------" "------" \
    "----------------------------------------"

  # node
  local want="${ENGINE_NODE//[!0-9]/}"
  if command -v node >/dev/null 2>&1; then
    local nv nvs nmaj
    nv="$(node --version 2>/dev/null || echo "")"
    nvs="${nv#v}"
    nmaj="${nvs%%.*}"
    drow PASS "node present" "$nv"
    if [ -n "$nmaj" ] && [ -n "$want" ] && [ "$nmaj" -lt "$want" ] 2>/dev/null; then
      drow WARN "node major >= $want" \
        "found $nmaj; engines wants ${ENGINE_NODE}. Dev runs on $nmaj; the container image pins Node $want."
    else
      drow PASS "node major >= $want" "found ${nmaj:-?}"
    fi
  else
    drow WARN "node present" "not found on PATH - install Node ${ENGINE_NODE}"
  fi

  # pnpm
  if command -v pnpm >/dev/null 2>&1; then
    drow PASS "pnpm present" "$(pnpm --version 2>/dev/null || echo "?")"
  else
    drow WARN "pnpm present" "not found - install pnpm, then pnpm install"
  fi

  # dependencies
  if [ -d "$REPO_ROOT/node_modules" ]; then
    drow PASS "dependencies installed" "node_modules present"
  else
    drow WARN "dependencies installed" "node_modules absent - run pnpm install"
  fi

  # app/dist
  if [ -d "$REPO_ROOT/app/dist" ]; then
    drow PASS "app/dist (built UI)" "present - the one-port server can serve the UI"
  else
    drow WARN "app/dist (built UI)" \
      "absent - http://127.0.0.1:${SERVER_PORT}/ 404s (API only). Run pnpm build or scripts/launch.sh up."
  fi

  # ports
  local p5173 pserver
  p5173="$(port_status 5173)"
  pserver="$(port_status "$SERVER_PORT")"
  case "$p5173" in
    free) drow PASS "port 5173 (Vite UI)" "free" ;;
    listening) drow WARN "port 5173 (Vite UI)" "already in use - a UI may be running" ;;
    *) drow INFO "port 5173 (Vite UI)" "unknown (no ss/lsof to probe)" ;;
  esac
  case "$pserver" in
    free) drow PASS "port ${SERVER_PORT} (server)" "free" ;;
    listening) drow WARN "port ${SERVER_PORT} (server)" "already in use - a server may be running" ;;
    *) drow INFO "port ${SERVER_PORT} (server)" "unknown (no ss/lsof to probe)" ;;
  esac

  # .env.docbox
  if [ "$SOURCED_ENV" = 1 ]; then
    drow PASS ".env.docbox" "present and sourced"
  else
    drow WARN ".env.docbox" "absent - run scripts/launch.sh configure to write it"
  fi

  # env echo
  drow INFO "DOCBOX_DATA" "${DOCBOX_DATA:-(unset -> seeded)}"
  drow INFO "DOCBOX_ENGINE" "${DOCBOX_ENGINE:-(unset -> mock)}"

  printf '\n  %sSummary:%s %d PASS, %d WARN\n' "$BOLD" "$RESET" "$DOCTOR_PASS" "$DOCTOR_WARN"
  if [ "$STRICT" = 1 ] && [ "$DOCTOR_WARN" -gt 0 ]; then
    err "--strict: $DOCTOR_WARN warning(s) -> non-zero exit"
    return 1
  fi
  return 0
}

# ── configure ────────────────────────────────────────────────────────────────
ask() {
  local prompt="$1" default="$2" reply=""
  read -r -p "  $prompt [$default]: " reply || reply=""
  if [ -z "$reply" ]; then printf '%s' "$default"; else printf '%s' "$reply"; fi
}
mode_configure() {
  heading "configure - write the git-ignored .env.docbox dev config"

  local cur_data="${DOCBOX_DATA:-seed}"
  local cur_dir="${DOCBOX_DATA_DIR:-$REPO_ROOT/server/data}"
  local cur_engine="${DOCBOX_ENGINE:-mock}"
  local cur_port="${PORT:-8787}"
  local cur_vite="${VITE_DATA_MODE:-mock}"

  # non-interactive overrides
  local kv key val
  for kv in ${SETS[@]+"${SETS[@]}"}; do
    case "$kv" in
      *=*) key="${kv%%=*}"; val="${kv#*=}" ;;
      *) err "--set expects KEY=VALUE, got: $kv"; return 2 ;;
    esac
    case "$key" in
      DOCBOX_DATA)     cur_data="$val" ;;
      DOCBOX_DATA_DIR) cur_dir="$val" ;;
      DOCBOX_ENGINE)   cur_engine="$val" ;;
      PORT)            cur_port="$val" ;;
      VITE_DATA_MODE)  cur_vite="$val" ;;
      *) err "unknown key: $key (allowed: DOCBOX_DATA DOCBOX_DATA_DIR DOCBOX_ENGINE PORT VITE_DATA_MODE)"; return 2 ;;
    esac
  done

  local have_sets=0
  [ "${#SETS[@]}" -gt 0 ] && have_sets=1
  if [ "$have_sets" -eq 0 ] && [ "$PRINT" != 1 ] && interactive_ok; then
    printf '  Press Enter to keep the current value shown in [brackets].\n\n'
    cur_data="$(ask 'DOCBOX_DATA (seed|real)' "$cur_data")"
    cur_dir="$(ask 'DOCBOX_DATA_DIR (real JSON store dir)' "$cur_dir")"
    cur_engine="$(ask 'DOCBOX_ENGINE (mock|live)' "$cur_engine")"
    cur_port="$(ask 'PORT (control-plane server)' "$cur_port")"
    cur_vite="$(ask 'VITE_DATA_MODE (mock|live)' "$cur_vite")"
  fi

  # Values are single-quoted (with embedded quotes escaped) because launch.sh
  # sources this file under `set -a`: an unquoted metacharacter would otherwise
  # be interpreted by the shell on the next run.
  shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
  local content
  content="$(cat <<EOF
# docBox dev environment - written by scripts/launch.sh configure ($(date -u +%FT%TZ))
# Git-ignored (.env.docbox). scripts/launch.sh sources this when present.
# NOTE: this configures the DEV run only. It does NOT configure the container:
# docker/foreman.toml is Foreman's Configuration-tab seam - edit container config
# there, not here.
DOCBOX_DATA=$(shq "$cur_data")
DOCBOX_DATA_DIR=$(shq "$cur_dir")
DOCBOX_ENGINE=$(shq "$cur_engine")
PORT=$(shq "$cur_port")
VITE_DATA_MODE=$(shq "$cur_vite")
EOF
)"

  if [ "$PRINT" = 1 ]; then
    printf '  Would write %s:\n\n' "$ENV_FILE"
    printf '%s\n' "$content" | while IFS= read -r line; do printf '    %s\n' "$line"; done
    return 0
  fi

  printf '%s\n' "$content" > "$ENV_FILE"
  ok "wrote $ENV_FILE"
  printf '  DOCBOX_DATA=%s  DOCBOX_ENGINE=%s  PORT=%s  VITE_DATA_MODE=%s\n' \
    "$cur_data" "$cur_engine" "$cur_port" "$cur_vite"
  printf '  DOCBOX_DATA_DIR=%s\n' "$cur_dir"
  note "This file is git-ignored and machine-local. It does not touch docker/foreman.toml."
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
if [ "$HELP" = 1 ]; then
  if [ -n "$SUB" ]; then usage_sub "$SUB"; else usage_top; fi
  exit 0
fi

if [ "$SOURCED_ENV" = 1 ] && [ "$PRINT" != 1 ] && [ -n "$SUB" ]; then
  note "sourced ./.env.docbox"
fi

case "$SUB" in
  demo)      mode_demo ;;
  dev)       mode_dev ;;
  real)      mode_real ;;
  up)        mode_up ;;
  companion) mode_companion ;;
  host)      mode_host ;;
  doctor)    mode_doctor ;;
  configure) mode_configure ;;
  "")
    if interactive_ok; then interactive; else usage_top; fi
    ;;
  *)
    err "unknown command: $SUB"
    usage_top
    exit 2
    ;;
esac
