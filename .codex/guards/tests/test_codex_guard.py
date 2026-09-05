from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).parents[1] / "codex_guard.py"
SPEC = importlib.util.spec_from_file_location("codex_guard", MODULE_PATH)
assert SPEC and SPEC.loader
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class DestructiveCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path("/tmp/example-repo")

    def test_blocks_destructive_git_and_broad_delete(self) -> None:
        cases = (
            "git reset --hard HEAD~1",
            "git checkout -- .",
            "git restore -- src",
            "git clean -fd",
            "rm -rf /",
            "rm -r -f .",
            "sudo /bin/rm -fr /tmp/example-repo",
        )
        with mock.patch.object(guard, "oversized_untracked", return_value=[]):
            for command in cases:
                with self.subTest(command=command):
                    self.assertIsNotNone(guard.destructive_reason(command, self.root))

    def test_allows_targeted_and_read_only_commands(self) -> None:
        cases = ("git status --short", "git diff -- src/app.ts", "rm -f /tmp/one-generated-file.txt", "git restore --staged src/app.ts", "git add src/app.ts")
        with mock.patch.object(guard, "oversized_untracked", return_value=[]):
            for command in cases:
                with self.subTest(command=command):
                    self.assertIsNone(guard.destructive_reason(command, self.root))

    def test_blocks_broad_stage_only_with_large_untracked_file(self) -> None:
        with mock.patch.object(guard, "oversized_untracked", return_value=["build/model.glb"]):
            self.assertIn("model.glb", guard.destructive_reason("git add -A", self.root) or "")
        with mock.patch.object(guard, "oversized_untracked", return_value=[]):
            self.assertIsNone(guard.destructive_reason("git add -A", self.root))

    def test_reads_both_shell_tool_input_shapes(self) -> None:
        self.assertEqual("git status", guard.shell_command({"tool_input": {"command": "git status"}}))
        self.assertEqual("git diff", guard.shell_command({"tool_input": {"cmd": "git diff"}}))

    def test_pre_shell_response_has_exact_deny_shape(self) -> None:
        response = guard.pre_shell_response({"tool_input": {"cmd": "git reset --hard HEAD"}}, self.root)
        self.assertEqual("PreToolUse", response["hookSpecificOutput"]["hookEventName"])
        self.assertEqual("deny", response["hookSpecificOutput"]["permissionDecision"])
        self.assertEqual({}, guard.pre_shell_response({"tool_input": {"cmd": "git status"}}, self.root))


class TruncationTests(unittest.TestCase):
    def test_detects_structured_and_explicit_truncation(self) -> None:
        self.assertTrue(guard.find_truncation({"truncated": True, "output": "preview"}))
        self.assertTrue(guard.find_truncation({"content": [{"text": "Output was truncated; narrow the query."}]}))

    def test_does_not_infer_truncation_from_size_or_unrelated_prose(self) -> None:
        self.assertFalse(guard.find_truncation({"output": "x" * 60000}))
        self.assertFalse(guard.find_truncation("This test ensures ordinary output remains intact."))

    def test_post_output_response_has_exact_context_shape(self) -> None:
        response = guard.post_output_response({"tool_response": {"truncated": True}})
        self.assertEqual("PostToolUse", response["hookSpecificOutput"]["hookEventName"])
        self.assertIn("Read the full artifact", response["hookSpecificOutput"]["additionalContext"])
        self.assertEqual({}, guard.post_output_response({"tool_response": {"output": "complete"}}))


class EditedPathTests(unittest.TestCase):
    def test_extracts_two_apply_patch_paths_and_rejects_outside_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "one.json").write_text("{}")
            (root / "two.py").write_text("pass\n")
            event = {"tool_input": {"patch": "*** Update File: one.json\n*** Add File: two.py\n*** Update File: ../outside.py"}}
            self.assertEqual([path.name for path in guard.edited_paths(event, root)], ["one.json", "two.py"])

    def test_json_checker_observes_parsed_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            path = root / "fixture.json"
            path.write_text(json.dumps({"female": True, "views": 6}))
            self.assertIsNone(guard.check_file(path, root))
            path.write_text('{"male": true,}')
            self.assertIn("trailing comma", (guard.check_file(path, root) or "").lower())


class StopGateTests(unittest.TestCase):
    def test_no_touched_ledger_means_no_gate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual([], guard.run_stop_gates(Path(directory)))

    def test_success_clears_ledger_and_failure_preserves_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ledger = root / ".codex/cache/touched.json"
            ledger.parent.mkdir(parents=True)
            ledger.write_text('["guardrails"]')
            with mock.patch.object(guard, "run_check", return_value=None):
                self.assertEqual([], guard.run_stop_gates(root))
                self.assertFalse(ledger.exists())
            ledger.write_text('["guardrails"]')
            with mock.patch.object(guard, "run_check", return_value="assertion failed"):
                self.assertEqual(1, len(guard.run_stop_gates(root)))
                self.assertTrue(ledger.exists())

    def test_malformed_ledger_fails_safe_into_guardrail_tests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ledger = root / ".codex/cache/touched.json"
            ledger.parent.mkdir(parents=True)
            ledger.write_text('{"unexpected": true}')
            with mock.patch.object(guard, "run_check", return_value="guard tests failed") as check:
                failures = guard.run_stop_gates(root)
            self.assertEqual(1, len(failures))
            self.assertEqual(root, check.call_args.args[1])
            self.assertTrue(ledger.exists())

    def test_stop_reentry_never_reruns_or_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with mock.patch.object(guard, "run_stop_gates", side_effect=AssertionError("must not run")):
                self.assertEqual({}, guard.stop_response({"stop_hook_active": True}, root))

    def test_first_stop_blocks_with_gate_diagnostic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with mock.patch.object(guard, "run_stop_gates", return_value=["tests failed"]):
                response = guard.stop_response({"stop_hook_active": False}, root)
            self.assertEqual("block", response["decision"])
            self.assertIn("tests failed", response["reason"])


if __name__ == "__main__":
    unittest.main()
