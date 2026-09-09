#!/usr/bin/env bash
set -euo pipefail
runner_dir="${HOME:?}/Library/Application Support/T3CodeNightly/repair-runner"
test -d "$runner_dir/.git"
test -z "$(git -C "$runner_dir" status --porcelain)"
git -C "$runner_dir" fetch --no-tags origin main
git -C "$runner_dir" merge --ff-only origin/main
exec /opt/homebrew/bin/node "$runner_dir/scripts/repair-nightly.mjs"
