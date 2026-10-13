#!/usr/bin/env bash
# Publish badge JSON files to the `badges` branch, never to main.
#
# Usage: publish_badges.sh <remote-url> <badges-dir>
# Needs GITHUB_SHA. Run from a checkout of that commit.
#
# Committing to main would put a bot commit on top of every push and reject the
# next push from a local clone. A dedicated branch avoids that and avoids rebase
# conflicts between runs.
set -euo pipefail

remote="$1"
badges_dir="$2"

git fetch --quiet "$remote" main
if [ "$(git rev-parse FETCH_HEAD)" != "$GITHUB_SHA" ]; then
  # A newer commit is on main: its own run publishes fresher badges.
  echo "main has moved past $GITHUB_SHA, skipping"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# ls-remote exits 2 only when the branch is absent; any other failure (network,
# auth) must stop the job instead of creating a second orphan branch.
branch_status=0
git ls-remote --exit-code --heads "$remote" badges >/dev/null || branch_status=$?
if [ "$branch_status" -eq 0 ]; then
  git fetch --quiet "$remote" badges
  git checkout --quiet -B badges FETCH_HEAD
elif [ "$branch_status" -ne 2 ]; then
  echo "Cannot read the badges branch (git ls-remote exit $branch_status)" >&2
  exit "$branch_status"
else
  # Empty index: the first commit holds only the badge files; the files left
  # from the main checkout stay untracked in the runner's workspace.
  git checkout --quiet --orphan badges
  git rm -r --quiet --cached .
fi

# Add only the copied badge files: on the orphan path the files of the main
# checkout are still in the tree, untracked.
files=()
for path in "$badges_dir"/*.json; do
  cp "$path" .
  files+=("$(basename "$path")")
done
git add -- "${files[@]}"
if git diff --cached --quiet; then
  echo "Badges unchanged"
  exit 0
fi
git commit --quiet -m "Update badges for $GITHUB_SHA"
git push --quiet "$remote" HEAD:badges
echo "Badges published for $GITHUB_SHA"
