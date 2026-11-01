#!/usr/bin/env bash
# CI: starts a throwaway LOCAL Convex backend (the CLI's anonymous local
# deployment) in the background and exports its URL + admin key to the job
# env, so scripts/convex-test-env.ts can push the repo's functions into it.
#
# The backend is owned by a scratch project in $RUNNER_TEMP — never the repo
# — so its file watcher never sees (or re-pushes over) the repo's convex/.
# Same shape as local dev: `convex dev` on a scratch dir, repo functions
# pushed with `convex dev --once` against CONVEX_SELF_HOSTED_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRATCH="${RUNNER_TEMP:-/tmp}/convex-backend"
mkdir -p "$SCRATCH/convex"
cd "$SCRATCH"
[ -f package.json ] || echo '{"name":"convex-backend-scratch","private":true}' > package.json
ln -sfn "$ROOT/node_modules" node_modules

CONVEX_AGENT_MODE=anonymous node node_modules/convex/bin/main.js dev \
  --tail-logs disable > "$SCRATCH/dev.log" 2>&1 &
echo "convex dev pid $!"

for _ in $(seq 1 120); do
  if curl -sf http://127.0.0.1:3210/version > /dev/null &&
    [ -f .convex/local/default/config.json ]; then
    break
  fi
  sleep 2
done
curl -sf http://127.0.0.1:3210/version > /dev/null || {
  echo "CONVEX_BACKEND_START_FAILED: no backend on :3210 after 240s" >&2
  tail -50 "$SCRATCH/dev.log" >&2
  exit 1
}

ADMIN_KEY="$(node -e 'console.log(require("./.convex/local/default/config.json").adminKey)')"
echo "::add-mask::$ADMIN_KEY"
{
  echo "CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210"
  echo "CONVEX_SELF_HOSTED_ADMIN_KEY=$ADMIN_KEY"
} >> "${GITHUB_ENV:-/dev/null}"
echo "local Convex backend ready on :3210 (site :3211)"
