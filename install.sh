#!/bin/sh
set -eu

cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  exec npm run install:local
fi

if command -v mise >/dev/null 2>&1 \
  && mise exec -- node --version >/dev/null 2>&1 \
  && mise exec -- npm --version >/dev/null 2>&1; then
  exec mise exec -- npm run install:local
fi

if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  exec pnpm run install:local
fi

echo "Personal Stream needs Node.js plus npm or pnpm (a mise-managed Node/npm installation is supported)." >&2
exit 1
