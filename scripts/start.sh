#!/bin/bash
# Launches the MCP server, installing dependencies and building first when needed.
# stdout is the MCP stdio channel, so all setup output goes to stderr.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "discord-mcp: installing dependencies..." >&2
  npm ci --no-audit --no-fund >&2
fi

if [ ! -f dist/index.js ] || [ -n "$(find src package.json tsconfig.json -newer dist/index.js -print -quit)" ]; then
  echo "discord-mcp: building..." >&2
  npm run build >&2
fi

exec node dist/index.js
