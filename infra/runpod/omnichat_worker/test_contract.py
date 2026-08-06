import os
import unittest

from .contract import ContractError, validate_input


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.previous = os.environ.pop("OMNICHAT_INPUT_HOSTS", None)
        self.previous_lora_allowlist = os.environ.pop("OMNICHAT_LORA_MODEL_ALLOWLIST", None)

    def tearDown(self):
        if self.previous is not None:
            os.environ["OMNICHAT_INPUT_HOSTS"] = self.previous
        if self.previous_lora_allowlist is not None:
            os.environ["OMNICHAT_LORA_MODEL_ALLOWLIST"] = self.previous_lora_allowlist

    def test_image_request_normalizes_and_limits_shape(self):
        request = validate_input(
            {
                "kind": "image",
                "mode": "contextual",
                "prompt": "  A   quiet park  ",
                "aspect_ratio": "4:5",
                "reference_image_urls": ["https://storage.googleapis.com/bucket/character.png"],
            },
            expected_kind="image",
        )
        self.assertEqual(request.prompt, "A quiet park")
        self.assertEqual((request.width, request.height), (896, 1120))
        self.assertEqual(len(request.reference_image_urls), 1)
        self.assertEqual(request.identity_mode, "reference")
        self.assertEqual(request.identity_adapter, "ip_adapter")
        self.assertAlmostEqual(request.identity_adapter_scale, 0.65)

    def test_contextual_scene_snapshot_is_normalized(self):
        request = validate_input(
            {
                "kind": "image",
                "mode": "contextual",
                "prompt": "Show the current scene",
                "scene": {
                    "location": "dungeon",
                    "activity": "speaks to",
                    "recent_events": ["older beat", "latest beat"],
                },
            },
            expected_kind="image",
        )
        self.assertEqual(request.scene["location"], "dungeon")
        self.assertEqual(request.scene["recent_events"], ["older beat", "latest beat"])
        with self.assertRaises(ContractError):
            validate_input({"kind": "image", "prompt": "x", "scene": "not an object"})

    def test_lora_identity_requires_safe_allowlisted_weights(self):
        os.environ["OMNICHAT_LORA_MODEL_ALLOWLIST"] = "nickf579/sadie-lora"
        request = validate_input(
            {
                "kind": "image",
                "prompt": "Sadie in a park",
                "identity_mode": "lora",
                "lora_model_id": "nickf579/sadie-lora",
                "lora_weight_name": "weights.safetensors",
            }
        )
        self.assertEqual(request.lora_model_id, "nickf579/sadie-lora")
        with self.assertRaises(ContractError):
            validate_input(
                {
                    "kind": "image",
                    "prompt": "x",
                    "identity_mode": "lora",
                    "lora_model_id": "other/model",
                    "lora_weight_name": "weights.safetensors",
                }
            )
        with self.assertRaises(ContractError):
            validate_input(
                {
                    "kind": "image",
                    "prompt": "x",
                    "identity_mode": "lora",
                    "lora_model_id": "nickf579/sadie-lora",
                    "lora_weight_name": "../weights.safetensors",
                }
            )

    def test_video_requires_source_for_image_to_video(self):
        with self.assertRaisesRegex(ContractError, "source_image_url"):
            validate_input({"kind": "video", "mode": "image_to_video", "prompt": "motion"})

    def test_rejects_private_and_unconfigured_urls(self):
        for url in ("http://example.test/image.png", "https://127.0.0.1/image.png", "https://example.test/image.png"):
            with self.subTest(url=url):
                with self.assertRaises(ContractError):
                    validate_input({"kind": "video", "mode": "image_to_video", "prompt": "motion", "source_image_url": url})

    def test_accepts_signed_url_on_configured_host(self):
        os.environ["OMNICHAT_INPUT_HOSTS"] = "media.example.test"
        request = validate_input(
            {
                "kind": "video",
                "mode": "image_to_video",
                "prompt": "motion",
                "source_image_url": "https://media.example.test/image.png?X-Amz-Signature=secret",
            }
        )
        self.assertEqual(request.source_image_url, "https://media.example.test/image.png?X-Amz-Signature=secret")

    def test_rejects_endpoint_kind_mismatch_and_unbounded_values(self):
        with self.assertRaises(ContractError):
            validate_input({"kind": "video", "prompt": "x"}, expected_kind="image")
        with self.assertRaises(ContractError):
            validate_input({"kind": "image", "prompt": "x", "num_images": 5})
        with self.assertRaises(ContractError):
            validate_input({"kind": "video", "prompt": "x", "duration_seconds": 11})


if __name__ == "__main__":
    unittest.main()
