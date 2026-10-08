#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export CHATGPT_WEB_ROOT="$PWD"
export CODEX_ELECTRON_USER_DATA_PATH="$PWD/.profile"
export CHATGPT_WEB_PORT="${CHATGPT_WEB_PORT:-18765}"
mkdir -p .logs
chmod 700 .logs
exec flock -F -n .logs/instance.lock "$PWD/.runtime/ChatGPT" --user-data-dir="$CODEX_ELECTRON_USER_DATA_PATH" "$@"
