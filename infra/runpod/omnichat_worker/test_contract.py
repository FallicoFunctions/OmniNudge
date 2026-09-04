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


class SceneContractCompletenessTests(unittest.TestCase):
    """The scene whitelist is the contract; omissions fail silently.

    A field the backend computes but that contract._scene does not list is
    dropped with no error and no log, and simply never reaches the renderer.
    accessories, viewer_position, subject_appearance and include_user_body were
    all computed correctly server-side and discarded here for hours.
    """

    def _payload(self, scene):
        return {"kind": "image", "mode": "contextual", "prompt": "Show the scene.",
                "aspect_ratio": "4:5", "num_images": 1, "scene": scene}

    def test_every_field_the_backend_sends_survives_validation(self):
        scene = {
            "location": "a red and black room", "activity": "dancing",
            "outfit": "pink g-string thong", "pose": "swaying hips",
            "expression": "sultry", "mood": "playful",
            "accessories": ["belly button ring", "nipple piercings"],
            "viewer_position": "laying back against the headboard",
            "subject_appearance": "41 year old woman, dirty blonde hair",
            "include_user_body": True,
        }
        got = validate_input(self._payload(scene)).scene
        for key in scene:
            self.assertIn(key, got, f"scene.{key} is silently dropped by the contract")
        self.assertEqual(got["accessories"], ["belly button ring", "nipple piercings"])
        self.assertIs(got["include_user_body"], True)

    def test_include_user_body_must_be_a_boolean(self):
        with self.assertRaises(ContractError):
            validate_input(self._payload({"include_user_body": "yes"}))


class BodyAdapterContractTests(unittest.TestCase):
    """A request may switch the whole-image adapter off, and may not switch it on.

    The close portraits in a character's reference set ask for it off: that
    adapter supplies a whole standing person and overrides a prompt asking for
    head and shoulders. Accepting True would let a forged request re-enable
    conditioning the operator had disabled, so the only direction a request can
    ask for is the one that removes it.
    """

    def _request(self, **extra):
        payload = {
            "kind": "image",
            "mode": "create",
            "prompt": "a portrait",
            "aspect_ratio": "3:4",
        }
        payload.update(extra)
        return validate_input(payload, expected_kind="image")

    def test_absent_leaves_the_endpoint_to_decide(self):
        self.assertIsNone(self._request().body_adapter)
        self.assertIsNone(self._request(body_adapter="").body_adapter)

    def test_false_switches_it_off_for_this_render(self):
        self.assertIs(self._request(body_adapter=False).body_adapter, False)

    def test_true_is_not_a_way_to_turn_it_back_on(self):
        self.assertIsNone(self._request(body_adapter=True).body_adapter)

    def test_anything_else_is_refused(self):
        for value in ("no", 0, 1, [], {}):
            with self.assertRaises(ContractError):
                self._request(body_adapter=value)
