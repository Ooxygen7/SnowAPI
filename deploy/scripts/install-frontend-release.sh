#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <incoming-directory> <release-id>" >&2
  exit 2
fi

incoming_directory=$1
release_id=$2
frontend_base=${SNOWAPI_FRONTEND_BASE:-/var/www/snowapi-frontend}

if [[ ! $release_id =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "invalid release id: $release_id" >&2
  exit 2
fi

incoming_directory=$(readlink -f -- "$incoming_directory")
if [[ ! -d $incoming_directory/default || ! -d $incoming_directory/classic ]]; then
  echo "incoming release must contain default/ and classic/" >&2
  exit 2
fi
if [[ ! -f $incoming_directory/default/index.html || ! -f $incoming_directory/classic/index.html ]]; then
  echo "both themes must contain index.html" >&2
  exit 2
fi

for theme in default classic; do
  for forbidden_entry in .dockerenv dev etc proc sys; do
    if [[ -e $incoming_directory/$theme/$forbidden_entry ]]; then
      echo "forbidden build entry: $theme/$forbidden_entry" >&2
      exit 2
    fi
  done
  if find "$incoming_directory/$theme" -type l -print -quit | grep -q .; then
    echo "$theme contains an unexpected symbolic link" >&2
    exit 2
  fi
  if find "$incoming_directory/$theme" ! -type f ! -type d -print -quit | grep -q .; then
    echo "$theme contains a non-regular filesystem entry" >&2
    exit 2
  fi
done

install -d -m 0755 "$frontend_base" "$frontend_base/assets/static" "$frontend_base/releases"
exec 9>"$frontend_base/.deploy.lock"
flock -x 9

if [[ -f $incoming_directory/SHA256SUMS ]]; then
  (
    cd "$incoming_directory"
    sha256sum --check SHA256SUMS
  )
fi

python3 - "$incoming_directory" <<'PY'
import pathlib
import re
import sys

incoming = pathlib.Path(sys.argv[1])
reference_pattern = re.compile(r'''(?:src|href)=["'](/static/[^"']+)["']''')
hash_pattern = re.compile(r'''[._-][0-9a-fA-F]{8,}(?=\.|$)''')

for theme in ("default", "classic"):
    theme_root = incoming / theme
    index_text = (theme_root / "index.html").read_text(encoding="utf-8")
    missing = []
    for reference in reference_pattern.findall(index_text):
        target = theme_root / reference.removeprefix("/")
        if not target.is_file():
            missing.append(reference)
    if missing:
        raise SystemExit(f"{theme} index references missing static files: {missing}")

    unhashed = []
    static_root = theme_root / "static"
    if not static_root.is_dir():
        raise SystemExit(f"{theme} is missing static/")
    for target in static_root.rglob("*"):
        if target.is_file() and not hash_pattern.search(target.name):
            unhashed.append(target.relative_to(static_root).as_posix())
    if unhashed:
        raise SystemExit(f"{theme} contains unhashed static files: {unhashed[:10]}")
PY

release_directory=$frontend_base/releases/$release_id
temporary_release=$frontend_base/releases/.${release_id}.tmp.$$
if [[ -e $release_directory || -e $temporary_release ]]; then
  echo "release already exists: $release_id" >&2
  exit 2
fi

install -d -m 0755 "$temporary_release/default" "$temporary_release/classic"

for theme in default classic; do
  source_static=$incoming_directory/$theme/static
  while IFS= read -r -d '' source_file; do
    relative_path=${source_file#"$source_static"/}
    target_file=$frontend_base/assets/static/$relative_path
    install -d -m 0755 "$(dirname -- "$target_file")"
    if [[ -f $target_file ]]; then
      if ! cmp -s -- "$source_file" "$target_file"; then
        echo "hashed asset collision: $relative_path" >&2
        exit 1
      fi
      continue
    fi
    install -m 0644 "$source_file" "$target_file"
  done < <(find "$source_static" -type f -print0)

  (
    cd "$incoming_directory/$theme"
    tar --exclude='./static' -cf - .
  ) | (
    cd "$temporary_release/$theme"
    tar -xf -
  )
  ln -s ../../../assets/static "$temporary_release/$theme/static"
done

container_environment=$(docker inspect snowapi --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)
export SNOWAPI_UMAMI_WEBSITE_ID=$(printf '%s\n' "$container_environment" | sed -n 's/^UMAMI_WEBSITE_ID=//p' | head -n 1)
export SNOWAPI_UMAMI_SCRIPT_URL=$(printf '%s\n' "$container_environment" | sed -n 's/^UMAMI_SCRIPT_URL=//p' | head -n 1)
export SNOWAPI_GOOGLE_ANALYTICS_ID=$(printf '%s\n' "$container_environment" | sed -n 's/^GOOGLE_ANALYTICS_ID=//p' | head -n 1)

python3 - "$temporary_release/default/index.html" "$temporary_release/classic/index.html" <<'PY'
import html
import json
import os
import pathlib
import sys

umami_id = os.environ.get("SNOWAPI_UMAMI_WEBSITE_ID", "")
umami_url = os.environ.get("SNOWAPI_UMAMI_SCRIPT_URL", "") or "https://analytics.umami.is/script.js"
google_id = os.environ.get("SNOWAPI_GOOGLE_ANALYTICS_ID", "")

umami_injection = ""
if umami_id:
    umami_injection = (
        f'<script defer src="{html.escape(umami_url, quote=True)}" '
        f'data-website-id="{html.escape(umami_id, quote=True)}"></script>'
    )
umami_injection += "<!--Umami QuantumNous-->\n"

google_injection = ""
if google_id:
    encoded_id = json.dumps(google_id)
    google_injection = (
        f'<script async src="https://www.googletagmanager.com/gtag/js?id={html.escape(google_id, quote=True)}"></script>'
        "<script>window.dataLayer = window.dataLayer || [];"
        "function gtag(){dataLayer.push(arguments);}"
        "gtag('js', new Date());"
        f"gtag('config', {encoded_id});</script>"
    )
google_injection += "<!--Google Analytics QuantumNous-->\n"

for filename in sys.argv[1:]:
    path = pathlib.Path(filename)
    content = path.read_text(encoding="utf-8")
    content = content.replace("<!--umami-->\n", umami_injection)
    content = content.replace("<!--umami-->", umami_injection.rstrip("\n"))
    content = content.replace("<!--Google Analytics-->\n", google_injection)
    content = content.replace("<!--Google Analytics-->", google_injection.rstrip("\n"))
    path.write_text(content, encoding="utf-8")
PY

printf '%s\n' "$release_id" >"$temporary_release/RELEASE"
(
  cd "$temporary_release"
  find -L default classic -type f -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS
)
chmod -R a+rX "$temporary_release"
mv -- "$temporary_release" "$release_directory"

previous_release=$(readlink "$frontend_base/current" 2>/dev/null || true)
temporary_link=$frontend_base/.current.$release_id.$$
ln -s "releases/$release_id" "$temporary_link"
mv -Tf -- "$temporary_link" "$frontend_base/current"

printf '%s\n' "$previous_release" >"$frontend_base/PREVIOUS_RELEASE"
printf '%s\n' "$release_id" >"$frontend_base/DEPLOYED_RELEASE"
echo "release=$release_id"
echo "previous=$previous_release"
echo "current=$(readlink "$frontend_base/current")"
