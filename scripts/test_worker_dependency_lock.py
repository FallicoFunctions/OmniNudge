"""Controls for dependency drift, including the observed Kokoro regression."""

from types import SimpleNamespace
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import worker_dependency_lock as guard

from worker_dependency_lock import read_pins, verify_lock, verify_inputs, audit_requirements


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

    def test_compiled_lock_cannot_change_a_direct_input_or_hide_a_major(self):
        inputs = "--extra-index-url https://download.pytorch.org/whl/cpu\nkokoro==0.9.4\ntorch==2.13.0+cpu\n"
        verify_inputs(inputs, "kokoro==0.9.4\ntorch==2.13.0+cpu\n")
        for lock in ("kokoro==1.0.0\ntorch==2.13.0+cpu\n", "torch==2.13.0+cpu\n"):
            with self.assertRaisesRegex(ValueError, "differs from direct input"):
                verify_inputs(inputs, lock)

    def test_cpu_lock_matches_only_the_same_upstream_cuda_release_and_audits_it(self):
        lock = "torch==2.13.0+cpu\ntorchvision==0.28.0+cpu\n"
        packages = {"torch": SimpleNamespace(version="2.13.0+cu130", requires=[]),
                    "torchvision": SimpleNamespace(version="0.28.0+cu130", requires=["torch==2.13.0"])}
        verify_lock(lock, packages.__getitem__)
        self.assertEqual(audit_requirements(lock), "torch==2.13.0\ntorchvision==0.28.0\n")
        packages["torchvision"].requires = []
        packages["torch"].version = "2.14.0+cu130"
        with self.assertRaisesRegex(ValueError, "differs from committed"):
            verify_lock(lock, packages.__getitem__)

    def test_worker_entrypoint_rejects_a_lock_that_disagrees_with_its_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            worker = root / "infra/avatar-worker"
            worker.mkdir(parents=True)
            (worker / "requirements.in").write_text("kokoro==0.9.4\n")
            (worker / "requirements.txt").write_text("kokoro==1.0.0\n")
            with patch.object(guard, "__file__", str(root / "scripts/worker_dependency_lock.py")), \
                    patch.object(guard, "verify_lock") as graph_check:
                with self.assertRaisesRegex(ValueError, "differs from direct input"):
                    guard.verify_worker("avatar")
                graph_check.assert_not_called()

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
