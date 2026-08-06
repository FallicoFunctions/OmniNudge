import os
import unittest

from .storage import ObjectStore, StorageError


class StorageConfigTests(unittest.TestCase):
    def setUp(self):
        self.previous = {
            key: os.environ.get(key)
            for key in (
                "OMNICHAT_OUTPUT_BUCKET",
                "OMNICHAT_OUTPUT_PREFIX",
                "OMNICHAT_OUTPUT_URL_TTL_SECONDS",
                "OMNICHAT_OUTPUT_PUBLIC_BASE_URL",
            )
        }
        os.environ["OMNICHAT_OUTPUT_BUCKET"] = "omnichat-test"
        os.environ["OMNICHAT_OUTPUT_PREFIX"] = "omnichat"
        os.environ.pop("OMNICHAT_OUTPUT_PUBLIC_BASE_URL", None)

    def tearDown(self):
        for key, value in self.previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_ttl_is_bounded(self):
        os.environ["OMNICHAT_OUTPUT_URL_TTL_SECONDS"] = "99999"
        self.assertEqual(ObjectStore().url_ttl, 3600)

    def test_invalid_ttl_and_public_url_fail_closed(self):
        os.environ["OMNICHAT_OUTPUT_URL_TTL_SECONDS"] = "not-a-number"
        with self.assertRaises(StorageError):
            ObjectStore()
        os.environ["OMNICHAT_OUTPUT_URL_TTL_SECONDS"] = "900"
        os.environ["OMNICHAT_OUTPUT_PUBLIC_BASE_URL"] = "http://media.example.test"
        with self.assertRaises(StorageError):
            ObjectStore()


if __name__ == "__main__":
    unittest.main()
