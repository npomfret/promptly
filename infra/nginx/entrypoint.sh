#!/bin/sh
set -eu

CONFIG_DIR="/etc/nginx/templates"
TARGET_CONF="/etc/nginx/conf.d/default.conf"

if [ "${DISABLE_TLS:-0}" = "1" ]; then
  CONFIG_SOURCE="${CONFIG_DIR}/local.conf"
  echo "Using local nginx config (TLS disabled)"
else
  CONFIG_SOURCE="${CONFIG_DIR}/default.conf"
  echo "Using production nginx config (TLS enabled)"
fi

if [ ! -f "${CONFIG_SOURCE}" ]; then
  echo "❌ Nginx config not found at ${CONFIG_SOURCE}" >&2
  exit 1
fi

cp "${CONFIG_SOURCE}" "${TARGET_CONF}"
exec nginx -g 'daemon off;'
