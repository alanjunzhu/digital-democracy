#!/usr/bin/env bash
#
# Commit regenerated data files to main, tolerating another data run pushing
# while this one was fetching.
#
# `git pull --rebase` cannot resolve this situation: two runs both rewrite
# aggregate files such as data/bills/index.json, so the replay stops on a
# conflict and the whole run's data is thrown away. Regenerated files have a
# single correct resolution — the files this run just produced — so rebase onto
# the latest main and reapply them wholesale instead of merging hunks.
#
# Only the paths passed in are touched, so a run that owns data/votes/ cannot
# revert another run's data/bills/.
#
# Usage: scripts/commit-data.sh "<commit message>" <path> [<path>...]

set -euo pipefail

MESSAGE="${1:?commit message required}"
shift
PATHS=("${@:?at least one data path required}")

BRANCH="${DATA_BRANCH:-main}"
REMOTE="${DATA_REMOTE:-origin}"
MAX_ATTEMPTS="${DATA_PUSH_ATTEMPTS:-5}"

if [ -z "$(git status --porcelain -- "${PATHS[@]}")" ]; then
  echo "No data changes detected."
  exit 0
fi

# Keep the regenerated files outside the work tree so a reset cannot lose them.
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
for path in "${PATHS[@]}"; do
  [ -e "$path" ] || continue
  mkdir -p "$STAGING/$(dirname "$path")"
  cp -R "$path" "$STAGING/$(dirname "$path")/"
done

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  git fetch "$REMOTE" "$BRANCH"
  git reset --hard --quiet "$REMOTE/$BRANCH"

  for path in "${PATHS[@]}"; do
    if [ -e "$STAGING/$path" ]; then
      rm -rf "$path"
      mkdir -p "$(dirname "$path")"
      cp -R "$STAGING/$path" "$path"
    fi
  done

  git add -- "${PATHS[@]}"
  if git diff --staged --quiet; then
    echo "Data already matches $REMOTE/$BRANCH; nothing to commit."
    exit 0
  fi

  git commit -m "$MESSAGE"
  if git push "$REMOTE" "HEAD:$BRANCH"; then
    echo "Pushed data to $REMOTE/$BRANCH on attempt $attempt."
    exit 0
  fi

  echo "Push rejected — another run updated $BRANCH. Retrying ($attempt/$MAX_ATTEMPTS)..."
  sleep $((attempt * 5))
done

echo "::error::Could not push data after $MAX_ATTEMPTS attempts."
exit 1
