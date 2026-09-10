import importlib.util
import json
import os
import pathlib
import tempfile
import subprocess
import unittest

spec = importlib.util.spec_from_file_location("prune", pathlib.Path(__file__).with_name("prune-frontend-assets.py"))
prune = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prune)


class AssetRetentionTest(unittest.TestCase):
    def test_retains_all_release_assets_lazy_chunks_and_recent_sessions(self):
        with tempfile.TemporaryDirectory() as directory:
            base = pathlib.Path(directory)
            assets = base / "assets" / "static"
            assets.mkdir(parents=True)
            for name in ("main.12345678.js", "lazy.23456789.js", "old.34567890.js", "recent.456789ab.js", "orphan.56789abc.js"):
                file = assets / name
                file.write_text("asset")
                os.utime(file, (1, 1))
            os.utime(assets / "recent.456789ab.js", (1_000_000, 1_000_000))
            current = base / "releases" / "current-release"
            previous = base / "releases" / "previous-release"
            current.mkdir(parents=True)
            previous.mkdir()
            (current / "STATIC_ASSETS.json").write_text(json.dumps({"version":1, "assets":["main.12345678.js", "lazy.23456789.js"]}))
            (previous / "STATIC_ASSETS.json").write_text(json.dumps({"version":1, "assets":["old.34567890.js"]}))
            if os.name == "nt":
                link_path = str(base / "current").replace("'", "''")
                target_path = str(current).replace("'", "''")
                subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", f"New-Item -ItemType Junction -Path '{link_path}' -Target '{target_path}' | Out-Null"], check=True)
            else:
                (base / "current").symlink_to(current, target_is_directory=True)
            candidates = prune.asset_candidates(base, 7, 1_000_000)
            self.assertEqual([path.name for path in candidates], ["orphan.56789abc.js"])
            self.assertTrue(candidates[0].exists(), "preview must not delete files")
            (previous / "STATIC_ASSETS.json").unlink()
            with self.assertRaisesRegex(ValueError, "missing asset manifest"):
                prune.asset_candidates(base, 7, 1_000_000)
            (previous / "STATIC_ASSETS.json").write_text(json.dumps({"version":1, "assets":["../../outside"]}))
            with self.assertRaisesRegex(ValueError, "escapes assets"):
                prune.asset_candidates(base, 7, 1_000_000)


if __name__ == "__main__":
    unittest.main()
