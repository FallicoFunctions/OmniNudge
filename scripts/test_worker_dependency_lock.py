"""Controls for dependency drift, including the observed Kokoro regression."""

from types import SimpleNamespace
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from worker_dependency_lock import read_pins, verify_lock


class WorkerLockTests(unittest.TestCase):
    def fixture(self, transformer="5.18.0"):
        packages = {
            "kokoro": SimpleNamespace(version="0.9.4", requires=["transformers>=4.0", "misaki[en]>=0.9.4"]),
            "transformers": SimpleNamespace(version=transformer, requires=["torch>=2.2"]),
            "torch": SimpleNamespace(version="2.6.0+cpu", requires=[]),
            "misaki": SimpleNamespace(version="0.9.4", requires=['spacy>=3; extra == "en"', 'nonlinux>=1; sys_platform == "win32"']),
            "spacy": SimpleNamespace(version="3.8.16", requires=[]),
        }
        text = "kokoro==0.9.4\ntransformers==5.18.0\ntorch==2.6.0\nmisaki==0.9.4\nspacy==3.8.16\n"
        return text, packages

    def test_complete_graph_allows_matching_cpu_local_version_and_required_extras(self):
        text, packages = self.fixture()
        verify_lock(text, packages.__getitem__)

    def test_unpinned_transformers_fails_even_when_it_is_already_installed(self):
        text, packages = self.fixture()
        with self.assertRaisesRegex(ValueError, "Unpinned dependency: kokoro requires transformers"):
            verify_lock(text.replace("transformers==5.18.0\n", ""), packages.__getitem__)

    def test_resolved_version_cannot_drift_without_changing_lock(self):
        text, packages = self.fixture("5.19.0")
        with self.assertRaisesRegex(ValueError, "differs from committed"):
            verify_lock(text, packages.__getitem__)

    def test_extra_dependency_must_be_pinned(self):
        text, packages = self.fixture()
        with self.assertRaisesRegex(ValueError, "Unpinned dependency: misaki requires spacy"):
            verify_lock(text.replace("spacy==3.8.16\n", ""), packages.__getitem__)

    def test_gpu_runtime_exception_is_limited_to_the_container_graph(self):
        text, packages = self.fixture()
        text = text.replace("torch==2.6.0", "torch==2.13.0")
        packages["torch"].version = "2.13.0+cu130"
        packages["torch"].requires = ["cuda-toolkit[cudart]==13.0.3", "cuda-bindings>=13.0.3,<14", "nvidia-cudnn-cu13==9.20.0.48"]
        packages["cuda-toolkit"] = SimpleNamespace(version="13.0.3", requires=['nvidia-cuda-runtime==13.0.96.*; extra == "cudart"'])
        packages["nvidia-cuda-runtime"] = SimpleNamespace(version="13.0.96", requires=[])
        packages["cuda-bindings"] = SimpleNamespace(version="13.0.3", requires=["cuda-pathfinder~=1.1"])
        packages["cuda-pathfinder"] = SimpleNamespace(version="1.1.0", requires=[])
        packages["nvidia-cudnn-cu13"] = SimpleNamespace(version="9.20.0.48", requires=["nvidia-cublas"])
        packages["nvidia-cublas"] = SimpleNamespace(version="13.1.1.3", requires=[])
        verify_lock(text, packages.__getitem__)
        packages["nvidia-cudnn-cu13"].requires = ["nvidia-cublas>=14"]
        with self.assertRaisesRegex(ValueError, "installed nvidia-cublas"):
            verify_lock(text, packages.__getitem__)
        packages["nvidia-cudnn-cu13"].requires = ["unexpected-gpu-package"]
        with self.assertRaisesRegex(ValueError, "Unpinned dependency"):
            verify_lock(text, packages.__getitem__)
        packages["nvidia-cudnn-cu13"].requires = ["nvidia-cublas"]
        packages["torch"].requires = ["cuda-toolkit"]
        with self.assertRaisesRegex(ValueError, "Unpinned dependency"):
            verify_lock(text, packages.__getitem__)
        packages["torch"].requires = []
        packages["kokoro"].requires.append("cuda-toolkit==13.0.3")
        with self.assertRaisesRegex(ValueError, "Unpinned dependency"):
            verify_lock(text, packages.__getitem__)

    def test_reject_ambiguous_pins_and_normalized_duplicates(self):
        for invalid in ("torch>=2.6", "torch==2.*", "torch==2.6; python_version>'3'", "torch==2.6\ntorch==2.7", "foo_bar==1.0\nfoo-bar==1.0", ""):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                read_pins(invalid)

    def test_mutation_removing_missing_pin_guard_is_detected(self):
        source = Path(__file__).with_name("worker_dependency_lock.py").read_text()
        changed = source.replace("if child not in pins and not image_owned:", "if False:")
        self.assertNotEqual(source, changed)
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "worker_dependency_lock.py").write_text(changed)
            Path(directory, "test_worker_dependency_lock.py").write_text(Path(__file__).read_text())
            result = subprocess.run([sys.executable, "-m", "unittest", "test_worker_dependency_lock.WorkerLockTests.test_unpinned_transformers_fails_even_when_it_is_already_installed"], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("ValueError not raised", result.stderr)


if __name__ == "__main__":
    unittest.main()
