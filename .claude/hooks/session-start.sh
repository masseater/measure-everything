#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v vp >/dev/null 2>&1; then
  curl -fsSL https://vite.plus | VP_NODE_MANAGER=no bash >&2
  echo ". \"$HOME/.config/vite-plus/env\"" >>"$CLAUDE_ENV_FILE"
  . "$HOME/.config/vite-plus/env"
fi

for chrome in /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
  if [ -x "$chrome" ] && [ -z "${CHROME_PATH:-}" ]; then
    echo "export CHROME_PATH=\"$chrome\"" >>"$CLAUDE_ENV_FILE"
  fi
done

WEAVER_VERSION=0.28.0
WEAVER_SHA256=9878e2d56ad82ae441b0b527377a4f6001ae19f4af362fb0a4d951884f59ab61
if ! command -v weaver >/dev/null 2>&1; then
  weaver_dir="$HOME/.local/share/weaver-$WEAVER_VERSION"
  archive="$(mktemp)"
  curl -fsSL -o "$archive" "https://github.com/open-telemetry/weaver/releases/download/v$WEAVER_VERSION/weaver-x86_64-unknown-linux-gnu.tar.xz"
  echo "$WEAVER_SHA256  $archive" | sha256sum -c - >&2
  mkdir -p "$weaver_dir"
  tar -xJf "$archive" -C "$weaver_dir" --strip-components=1
  rm -f "$archive"
  echo "export PATH=\"$weaver_dir:\$PATH\"" >>"$CLAUDE_ENV_FILE"
fi

cd "$CLAUDE_PROJECT_DIR"
vp env on >&2
vp install --frozen-lockfile >&2
