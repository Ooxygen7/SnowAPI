#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <release-id>" >&2
  exit 2
fi

release_id=$1
frontend_base=${SNOWAPI_FRONTEND_BASE:-/var/www/snowapi-frontend}

if [[ ! $release_id =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "invalid release id: $release_id" >&2
  exit 2
fi

release_directory=$frontend_base/releases/$release_id
if [[ ! -f $release_directory/default/index.html || ! -f $release_directory/classic/index.html ]]; then
  echo "release is incomplete: $release_id" >&2
  exit 2
fi
if [[ ! -f $release_directory/SHA256SUMS ]]; then
  echo "release is missing SHA256SUMS: $release_id" >&2
  exit 2
fi

(
  cd "$release_directory"
  sha256sum --check SHA256SUMS
)

exec 9>"$frontend_base/.deploy.lock"
flock -x 9

previous_release=$(readlink "$frontend_base/current" 2>/dev/null || true)
temporary_link=$frontend_base/.rollback.$release_id.$$
ln -s "releases/$release_id" "$temporary_link"
mv -Tf -- "$temporary_link" "$frontend_base/current"

printf '%s\n' "$previous_release" >"$frontend_base/PREVIOUS_RELEASE"
printf '%s\n' "$release_id" >"$frontend_base/DEPLOYED_RELEASE"
echo "release=$release_id"
echo "previous=$previous_release"
echo "current=$(readlink "$frontend_base/current")"
