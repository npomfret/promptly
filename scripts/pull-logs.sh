#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST=${REMOTE_HOST:-root@promptly.snowmonkey.co.uk}
REMOTE_PATH=${REMOTE_PATH:-/opt/promptly}
SERVICE_NAME=${SERVICE_NAME:-promptly}
LOGS_DIR=${LOGS_DIR:-logs}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
LOGS_PATH="${REPO_ROOT}/${LOGS_DIR}"
mkdir -p "${LOGS_PATH}"

timestamp=$(date +"%Y%m%d-%H%M%S")
outfile="${LOGS_PATH}/${SERVICE_NAME}-${timestamp}.log"

format_args() {
  local formatted=""
  for arg in "$@"; do
    formatted+=" $(printf '%q' "$arg")"
  done
  printf '%s' "$formatted"
}

extra_args=$(format_args "$@")
remote_cmd="cd ${REMOTE_PATH} && docker-compose logs --no-color${extra_args} ${SERVICE_NAME}"

ssh "${REMOTE_HOST}" "${remote_cmd}" > "${outfile}"

echo "Saved logs to ${outfile}"
