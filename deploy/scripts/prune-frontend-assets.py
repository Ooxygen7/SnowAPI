#!/usr/bin/env python3
"""Reclaim unreferenced hashed assets; preview by default, never delete releases.

Every retained release must have an installer-generated STATIC_ASSETS.json.
Legacy releases without a manifest block cleanup rather than risk lazy chunks.
Run on the deployment host with --base /var/www/snowapi-frontend. --apply is
explicit authorization to delete the printed candidates after the grace period.
"""

import argparse
import json
import os
import pathlib
import re
import time


def asset_candidates(base, grace_days, now):
    base = pathlib.Path(base).resolve(strict=True)
    assets = base / "assets" / "static"
    releases = base / "releases"
    for directory in (base / "assets", assets, releases):
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError(f"expected a real directory: {directory}")
    current = base / "current"
    if not current.is_dir() or current.resolve(strict=True).parent != releases:
        raise ValueError("current must point to a release inside this frontend directory")
    references = set()
    retained = list(releases.iterdir())
    if not retained:
        raise ValueError("no releases found")
    for release in retained:
        if release.is_symlink() or not release.is_dir() or release.name.startswith("."):
            raise ValueError(f"unexpected release entry: {release.name}")
        manifest = release / "STATIC_ASSETS.json"
        if manifest.is_symlink() or not manifest.is_file():
            raise ValueError(f"missing asset manifest for {release.name}; cleanup refused")
        record = json.loads(manifest.read_text(encoding="utf-8"))
        paths = record.get("assets")
        if record.get("version") != 1 or not isinstance(paths, list) or not paths:
            raise ValueError(f"invalid asset manifest for {release.name}")
        for name in paths:
            if not isinstance(name, str) or "\\" in name:
                raise ValueError("invalid manifest path")
            relative = pathlib.PurePosixPath(name)
            if relative.is_absolute() or ".." in relative.parts or not relative.parts:
                raise ValueError("manifest path escapes assets")
            target = assets.joinpath(*relative.parts)
            if not target.is_file() or target.resolve().is_relative_to(assets) is False:
                raise ValueError(f"missing or unsafe retained asset: {name}")
            references.add(relative.as_posix())
    cutoff = now - grace_days * 86400
    candidates = []
    for directory, folders, files in os.walk(assets, followlinks=False):
        for name in folders + files:
            target = pathlib.Path(directory) / name
            if target.is_symlink():
                raise ValueError(f"unexpected asset symlink: {target}")
        for name in files:
            target = pathlib.Path(directory) / name
            relative = target.relative_to(assets).as_posix()
            if (relative not in references and target.stat().st_mtime < cutoff
                    and re.search(r"[._-][0-9a-fA-F]{8,}(?=\.|$)", name)):
                candidates.append(target)
    return sorted(candidates)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--grace-days", type=int, default=7)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.grace_days < 1:
        parser.error("grace period must be at least one day")
    base = pathlib.Path(args.base).resolve(strict=True)
    if base == pathlib.Path(base.anchor) or base == pathlib.Path.home():
        parser.error("refusing a broad filesystem target")
    # Share the installer's lock so publication and collection cannot race.
    import fcntl
    with (base / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        candidates = asset_candidates(base, args.grace_days, time.time())
        total = sum(path.stat().st_size for path in candidates)
        for path in candidates:
            print(path.relative_to(base).as_posix())
        print(f"{'delete' if args.apply else 'preview'}: {len(candidates)} files, {total} bytes")
        if args.apply:
            for path in candidates:
                path.unlink()


if __name__ == "__main__":
    main()
