"""Controls for dependency drift, including the observed Kokoro regression."""

from types import SimpleNamespace
from pathlib import Path
import os
import re
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

    def test_regenerated_lock_survives_dependabot_unsafe_footer_cleanup(self):
        # Dependabot's PipCompileFileUpdater removes this entire suffix when
        # the original lock has no unsafe footer. PR #151 lost setuptools.
        unsafe_note = r"\s*# The following packages are considered to be unsafe.*\Z"
        compiled = "packaging==26.3\ntorch==2.13.0+cpu\n\n# The following packages are considered to be unsafe in a requirements file:\nsetuptools==84.0.0\n"

        def postprocess(original):
            if not re.search(unsafe_note, original, re.S):
                return re.sub(unsafe_note, "\n", compiled, flags=re.S)
            return compiled

        previous = "packaging==26.3\nsetuptools==84.0.0\ntorch==2.13.0+cpu\n"
        self.assertNotIn("setuptools", read_pins(postprocess(previous)))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            worker = root / "infra/avatar-worker"
            worker.mkdir(parents=True)
            lock = worker / "requirements.txt"
            lock.write_text(previous)
            lock.with_suffix(".in").write_text("torch==2.13.0+cpu\n")
            script = root / "scripts/lock-worker-dependencies.sh"
            script.write_text(Path(__file__).with_name(script.name).read_text())
            binary = root / "bin"
            binary.mkdir()
            # uv owns resolution; this control exercises the actual lock writer
            # with its resolved output, without registry access or installations.
            uv = binary / "uv"
            uv.write_text("#!/bin/sh\nexit 0\n")
            uv.chmod(0o755)
            subprocess.run(["bash", str(script), "avatar"], check=True,
                           env={**os.environ, "PATH": f"{binary}:{os.environ['PATH']}"})
            regenerated = lock.read_text()
            self.assertEqual(read_pins(regenerated), read_pins(previous))
            self.assertEqual(read_pins(postprocess(regenerated))["setuptools"].specifier,
                             read_pins(previous)["setuptools"].specifier)

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

    def test_worker_entrypoint_preserves_requested_root_extras(self):
        packages = {
            "feature": SimpleNamespace(version="1.0.0", requires=['addon>=2; extra == "render"']),
            "addon": SimpleNamespace(version="2.0.0", requires=[]),
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            worker = root / "infra/avatar-worker"
            worker.mkdir(parents=True)
            inputs, lock = worker / "requirements.in", worker / "requirements.txt"
            inputs.write_text("feature==1.0.0\n")
            lock.write_text("feature==1.0.0\n")
            with patch.object(guard, "__file__", str(root / "scripts/worker_dependency_lock.py")), \
                    patch.object(guard, "verify_lock", lambda text, **options: verify_lock(text, packages.__getitem__, **options)):
                guard.verify_worker("avatar")
                inputs.write_text("feature[render]==1.0.0\n")
                with self.assertRaisesRegex(ValueError, "Unpinned dependency: feature requires addon"):
                    guard.verify_worker("avatar")
                lock.write_text("feature==1.0.0\naddon==2.0.0\n")
                guard.verify_worker("avatar")
                packages["feature"].requires = ['addon>=3; extra == "render"']
                with self.assertRaisesRegex(ValueError, "feature requires addon>=3"):
                    guard.verify_worker("avatar")

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
