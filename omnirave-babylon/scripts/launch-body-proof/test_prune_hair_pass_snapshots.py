"""Safety controls for the hair-pass snapshot pruner."""
import importlib.util
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('hair_pruner', Path(__file__).with_name('prune_hair_pass_snapshots.py'))
PRUNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRUNER)


class PruneHairPassSnapshotsTest(unittest.TestCase):
    def test_only_old_nested_binary_snapshots_are_eligible(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            old = root / 'old-pass' / 'before' / 'male.glb'
            old_mapping = root / 'old-pass' / 'before' / 'male-vertex-mapping.json'
            protected = [
                root / 'male-hair-refined.blend',
                root / 'before' / 'male-runtime.blend',
                root / 'old-pass' / 'report.json',
                root / 'old-pass' / 'front.png',
                root / 'recent-pass' / 'candidate.blend',
            ]
            now = time.time()
            for path in [old, old_mapping, *protected]:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'fixture')
            for path in [old, old_mapping, *protected[:-1]]:
                os.utime(path, (now - 7200, now - 7200))
            self.assertEqual(PRUNER.candidates(root, 3600, now), sorted([old, old_mapping]))
            self.assertTrue(all(path.exists() for path in protected))

    def test_size_guard_passes_when_empty_and_fails_on_nested_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'hair'
            script = Path(__file__).with_name('prune_hair_pass_snapshots.py')
            command = [sys.executable, str(script), '--root', str(root), '--check-max-gib', '0.000000001']
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            root.mkdir()
            (root / 'male-hair-refined.blend').write_bytes(b'protected editable source')
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            pass_dir = root / 'old-pass'
            pass_dir.mkdir()
            (pass_dir / 'male.glb').write_bytes(b'large snapshot')
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)

    def test_lfs_guard_passes_when_empty_and_fails_on_cache_growth(self):
        with tempfile.TemporaryDirectory() as temp:
            objects = Path(temp) / 'objects'
            script = Path(__file__).with_name('prune_hair_pass_snapshots.py')
            command = [sys.executable, str(script), '--lfs-root', str(objects),
                       '--check-lfs-max-gib', '0.000000001']
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            object_path = objects / 'ab' / 'cd' / 'abcdef'
            object_path.parent.mkdir(parents=True)
            object_path.write_bytes(b'large cached revision')
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)


if __name__ == '__main__':
    unittest.main()
