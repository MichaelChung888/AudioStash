#!/usr/bin/env bash
# Deploys the commit on the release branch, which CI moves there once every check
# passes on main. audiostash-update.timer runs this every two minutes.
# Start it by hand with: sudo systemctl start audiostash-update
# docs/shipping-changes.md has the details.
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."
  # The last commit deployed successfully. systemd makes the folder (StateDirectory).
  local state="${STATE_DIRECTORY:?Run this through systemd: sudo systemctl start audiostash-update}/deployed"

  git fetch --quiet origin release
  local target
  target=$(git rev-parse FETCH_HEAD)
  # A failed deploy writes nothing, so the next run tries the same commit again.
  if [[ -f "$state" && "$(<"$state")" == "$target" ]]; then
    return 0
  fi

  echo "Deploying $(git log -1 --format='%h %s' "$target")"
  # Detached: the server runs exactly the released commit, with no branch of its own.
  # Fails if a tracked file was edited on the server, instead of losing the edit.
  git checkout --quiet --detach "$target"
  # --wait fails the deploy if the API does not become healthy.
  docker compose -f deploy/server/compose.yaml up -d --build --wait --wait-timeout 600
  echo "$target" >"$state"
  echo "Deployed $(git rev-parse --short "$target")"
  # Deletes the images this build replaced. Otherwise they fill the disk.
  docker image prune -f
}

# git checkout can replace this file while it runs, and bash reads a script as it
# goes. With main and exit on one line, bash has read all it will run before it starts.
main "$@"; exit
