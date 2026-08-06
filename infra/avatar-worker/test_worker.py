import os
import unittest

from .worker import _resolve_avatar_url


class AvatarURLTests(unittest.TestCase):
    def setUp(self):
        self.previous = os.environ.get("OMNICHAT_BACKEND_URL")
        os.environ["OMNICHAT_BACKEND_URL"] = "https://app.example.test"

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("OMNICHAT_BACKEND_URL", None)
        else:
            os.environ["OMNICHAT_BACKEND_URL"] = self.previous

    def test_resolves_application_upload_path(self):
        self.assertEqual(
            _resolve_avatar_url("/uploads/personas/sadie.png"),
            "https://app.example.test/uploads/personas/sadie.png",
        )

    def test_rejects_paths_outside_uploads(self):
        with self.assertRaises(RuntimeError):
            _resolve_avatar_url("/api/internal")
        with self.assertRaises(RuntimeError):
            _resolve_avatar_url("/uploads/../secrets.txt")


if __name__ == "__main__":
    unittest.main()
