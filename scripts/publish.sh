#!/usr/bin/env bash
# =============================================================================
# publish.sh — Build & push Docker images to Harbor for English Speaking Agent
#
# Usage:
#   ./publish.sh [COMPONENT]
#   ./publish.sh --help
#
# Arguments:
#   COMPONENT   Optional. One of: frontend | backend
#               If omitted, both images are built and pushed.
#
# Examples:
#   ./publish.sh              # build & push frontend + backend
#   ./publish.sh frontend     # build & push frontend only
#   ./publish.sh backend      # build & push backend only
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
REGISTRY="vinai-registry.duckdns.org"
PROJECT="english-speaking-agent"
IMAGE_FRONTEND="${REGISTRY}/${PROJECT}/frontend"
IMAGE_BACKEND="${REGISTRY}/${PROJECT}/backend"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log_info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
log_section() { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

# ── Help ──────────────────────────────────────────────────────────────────────
show_help() {
  cat <<EOF

${BOLD}publish.sh${RESET} — Build & push Docker images to Harbor

${BOLD}USAGE${RESET}
  $(basename "$0") [COMPONENT]
  $(basename "$0") --help

${BOLD}ARGUMENTS${RESET}
  COMPONENT   Optional. One of: ${CYAN}frontend${RESET} | ${CYAN}backend${RESET}
              Omit to build and push both.

${BOLD}REGISTRY${RESET}
  ${REGISTRY}/${PROJECT}/frontend
  ${REGISTRY}/${PROJECT}/backend

${BOLD}TAG STRATEGY${RESET}
  Each build produces two tags:
    • Dynamic : <YYYYMMDD>-<git-short-sha>   (e.g. 20260426-c3cc45b)
    • Stable  : latest

${BOLD}EXAMPLES${RESET}
  ./publish.sh              # build & push both
  ./publish.sh frontend     # build & push frontend only
  ./publish.sh backend      # build & push backend only

EOF
}

# ── Tag generation ────────────────────────────────────────────────────────────
make_tags() {
  local image="$1"
  local date_part
  local sha_part
  date_part=$(date +%Y%m%d)
  sha_part=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
  echo "${image}:${date_part}-${sha_part}" "${image}:latest"
}

# ── Pre-flight: verify Harbor login ───────────────────────────────────────────
check_registry_login() {
  log_section "Pre-flight check"

  # Docker stores credentials in ~/.docker/config.json; a pull of a tiny
  # manifest is the most reliable smoke-test without a dummy image.
  if docker login "${REGISTRY}" --username ignored --password ignored \
       2>&1 | grep -q "not logged in\|unauthorized\|denied\|error"; then
    # Above may fail for other reasons; do a gentler config.json check instead.
    true
  fi

  local config="${HOME}/.docker/config.json"
  if [[ -f "${config}" ]] && grep -q "${REGISTRY}" "${config}"; then
    log_ok "Already authenticated to ${REGISTRY}"
  else
    log_warn "No stored credentials found for ${REGISTRY}."
    log_info "Please log in now:"
    if ! docker login "${REGISTRY}"; then
      log_error "Login failed. Aborting."
      exit 1
    fi
    log_ok "Login successful."
  fi
}

# ── Build & push one image ────────────────────────────────────────────────────
build_and_push() {
  local name="$1"          # human label: frontend | backend
  local image="$2"         # full image name without tag
  local dockerfile="$3"    # path to Dockerfile
  local context="$4"       # build context directory

  log_section "Building ${name}"
  log_info "Dockerfile : ${dockerfile}"
  log_info "Context    : ${context}"

  # Generate both tags
  read -ra tags <<< "$(make_tags "${image}")"
  local version_tag="${tags[0]}"
  local latest_tag="${tags[1]}"
  log_info "Version tag: ${version_tag}"
  log_info "Latest tag : ${latest_tag}"

  # Build with both tags in one pass (no double build)
  docker build \
    --file "${dockerfile}" \
    --tag  "${version_tag}" \
    --tag  "${latest_tag}" \
    "${context}"

  log_ok "Build complete for ${name}."

  log_section "Pushing ${name}"
  docker push "${version_tag}"
  docker push "${latest_tag}"
  log_ok "Pushed ${version_tag}"
  log_ok "Pushed ${latest_tag}"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  local component="${1:-all}"

  if [[ "${component}" == "--help" || "${component}" == "-h" ]]; then
    show_help
    exit 0
  fi

  if [[ "${component}" != "all" && "${component}" != "frontend" && "${component}" != "backend" ]]; then
    log_error "Unknown component: '${component}'. Use: frontend | backend, or omit for both."
    show_help
    exit 1
  fi

  # Ensure we're in the repo root (parent of the scripts/ directory)
  cd "$(dirname "$(dirname "$(realpath "$0")")")"

  check_registry_login

  case "${component}" in
    frontend)
      build_and_push "frontend" "${IMAGE_FRONTEND}" "./Dockerfile.frontend" "."
      ;;
    backend)
      build_and_push "backend"  "${IMAGE_BACKEND}"  "./Dockerfile"          "."
      ;;
    all)
      build_and_push "backend"  "${IMAGE_BACKEND}"  "./Dockerfile"          "."
      build_and_push "frontend" "${IMAGE_FRONTEND}" "./Dockerfile.frontend" "."
      ;;
  esac

  log_section "Done"
  log_ok "All requested images have been built and pushed successfully."
}

main "$@"
