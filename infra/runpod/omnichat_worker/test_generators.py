import os
import unittest
from unittest.mock import patch

from . import generators as generator_module
from .generators import (
    DEFAULT_IMAGE_NEGATIVE_PROMPT,
    ImageGenerator,
    ModelError,
    _validate_download_url,
    build_image_negative_prompt,
    build_image_prompt,
    build_pose_control_image,
    contextual_identity_adapter_scale,
    contextual_image_strength,
    identity_conditioning_kwargs,
    image_pipeline_settings,
)


class GeneratorInputSecurityTests(unittest.TestCase):
    def setUp(self):
        self.previous = os.environ.get("OMNICHAT_INPUT_HOSTS")
        os.environ["OMNICHAT_INPUT_HOSTS"] = "media.example.test"

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("OMNICHAT_INPUT_HOSTS", None)
        else:
            os.environ["OMNICHAT_INPUT_HOSTS"] = self.previous

    def test_requires_exact_configured_input_host(self):
        with patch.object(generator_module.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("8.8.8.8", 443))]):
            self.assertEqual(
                _validate_download_url("https://media.example.test/image.png"),
                "https://media.example.test/image.png",
            )
        with self.assertRaises(ModelError):
            _validate_download_url("https://cdn.media.example.test/image.png")

    def test_image_default_model_is_publicly_downloadable(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ImageGenerator().model_id, "stabilityai/stable-diffusion-xl-base-1.0")

    def test_sdxl_turbo_uses_distilled_guidance_and_identity_preserving_strength(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(image_pipeline_settings("stabilityai/sdxl-turbo"), (4, 0.0, 0.65))

    def test_contextual_requests_use_stronger_scene_denoising(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(contextual_image_strength("stabilityai/sdxl-turbo"), 0.72)
        with patch.dict(os.environ, {"OMNICHAT_CONTEXT_IMAGE_STRENGTH": "0.91"}, clear=True):
            self.assertEqual(contextual_image_strength("stabilityai/sdxl-turbo"), 0.91)

    def test_quality_model_uses_quality_first_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(image_pipeline_settings("stabilityai/stable-diffusion-xl-base-1.0"), (25, 7.5, 0.55))

    def test_endpoint_overrides_are_bounded_and_invalid_values_fall_back(self):
        with patch.dict(
            os.environ,
            {
                "OMNICHAT_IMAGE_STEPS": "999",
                "OMNICHAT_IMAGE_GUIDANCE_SCALE": "nan",
                "OMNICHAT_IMAGE_STRENGTH": "-2",
            },
            clear=True,
        ):
            self.assertEqual(image_pipeline_settings("stabilityai/sdxl-turbo"), (60, 0.0, 0.05))

    def test_image_prompt_and_negative_prompt_block_layout_artifacts(self):
        prompt = build_image_prompt("Sadie stands beside the user in a park")
        self.assertTrue(prompt.startswith("A single coherent photorealistic image."))
        contextual = build_image_prompt("Sadie stands beside the user in a park", "contextual")
        self.assertIn("environmental photograph", contextual)
        self.assertIn("Photorealistic environmental photograph", contextual)
        self.assertIn("setting and action are visible", contextual)
        indoor_contextual = build_image_prompt("Location: dungeon. Current activity: stands nearby.", "contextual")
        self.assertIn("Interior-only:", indoor_contextual)
        self.assertIn("do not place trees, foliage, sky", indoor_contextual)
        self.assertTrue(indoor_contextual.startswith("Photorealistic environmental photograph in an enclosed underground stone-walled room"))
        self.assertIn("The character stands nearby", indoor_contextual)
        self.assertNotIn("Location: dungeon", indoor_contextual)
        self.assertLess(len(indoor_contextual), 1000)
        intimate_contextual = build_image_prompt(
            "Location: dungeon. Current activity: speaks to. Recent physical context: old beat; latest beat.",
            "contextual",
            {
                "location": "dungeon",
                "activity": "speaks to",
                "recent_events": ["old beat", "latest beat with restraints and naked interaction"],
            },
        )
        self.assertIn("Adult BDSM roleplay scene", intimate_contextual)
        self.assertIn("two connected nude adults", intimate_contextual)
        self.assertNotIn("one coherent character", intimate_contextual)
        self.assertIn("nude", intimate_contextual)
        self.assertIn("two connected nude adults", intimate_contextual)
        self.assertNotIn("Current physical activity: speaks to", intimate_contextual)
        direct_action = build_image_prompt(
            "Location: dungeon. Current activity: speaks to.",
            "contextual",
            {
                "location": "dungeon",
                "activity": "speaks to",
                "recent_events": ["User: *I aim my dick at your mouth.*", "Character: *I kneel between your legs.*"],
            },
        )
        self.assertIn("crop his face out", direct_action)
        self.assertIn("kneels between the man's legs", direct_action)
        self.assertIn("unclothed groin", direct_action)
        self.assertIn("his penis is directed", direct_action)
        self.assertIn("Exactly two adults only", direct_action)
        self.assertIn("only woman in frame", direct_action)
        self.assertIn("no clothing", direct_action)
        direct_negative = build_image_negative_prompt(
            "", "contextual", "Location: dungeon.",
            {"location": "dungeon", "recent_events": ["User: *I aim my dick at your mouth.*"]},
        )
        self.assertIn("second woman", direct_negative)
        self.assertIn("female user", direct_negative)
        self.assertNotIn("duplicate person", direct_negative)
        scene_context = build_image_prompt(
            "Location: dungeon. Current activity: speaks to.",
            "contextual",
            {
                "location": "dungeon",
                "recent_events": [
                    'Character: *I step closer and rest my hand on the table.* "Look at me."',
                    "User: ordinary dialogue with no physical direction",
                    "Character: *I kneel beside you and hold your wrist.*",
                ],
            },
        )
        self.assertIn("I kneel beside you and hold your wrist", scene_context)
        self.assertIn("I step closer and rest my hand on the table", scene_context)
        self.assertNotIn("Character:", scene_context)
        self.assertNotIn("Look at me", scene_context)
        self.assertNotIn("ordinary dialogue", scene_context)
        negative = build_image_negative_prompt("")
        self.assertEqual(negative, DEFAULT_IMAGE_NEGATIVE_PROMPT)
        self.assertIn("contact sheet", negative)
        self.assertIn("close-up portrait", negative)
        self.assertIn("reference image background", negative)
        self.assertIn("duplicate head", negative)
        self.assertIn("text", build_image_negative_prompt("plastic skin"))
        self.assertIn("plastic skin", build_image_negative_prompt("plastic skin"))
        indoor_negative = build_image_negative_prompt(
            "", "contextual", "Location: dungeon. Requested view: show the scene."
        )
        self.assertIn("forest", indoor_negative)
        outdoor_negative = build_image_negative_prompt(
            "", "contextual", "Location: park. Requested view: show the scene."
        )
        self.assertNotIn("forest, trees, foliage", outdoor_negative)
        intimate_negative = build_image_negative_prompt(
            "", "contextual", "Location: dungeon.", {"location": "dungeon", "recent_events": ["naked interaction"]}
        )
        self.assertIn("casual street clothes", intimate_negative)
        self.assertIn("third person", intimate_negative)
        self.assertNotIn("duplicate person", intimate_negative)

    def test_truncated_narration_after_opening_asterisk_is_visual_context(self):
        scene = {
            "location": "dungeon",
            "activity": "speaks to",
            "recent_events": [
                "User: FUCK!!!!! *I aim my dick at your mouth as the scene continues",
            ],
        }
        self.assertIn(
            "kneels between the man's legs",
            build_image_prompt("Location: dungeon. Current activity: speaks to.", "contextual", scene),
        )

    def test_identity_conditioning_uses_one_background_minimized_input(self):
        from PIL import Image

        request = type("Request", (), {"reference_image_urls": ("https://media.example.test/a.png",)})()
        references = [Image.new("RGB", (1200, 1600), "green"), Image.new("RGB", (1000, 1000), "blue")]
        kwargs = identity_conditioning_kwargs(request, references)
        self.assertEqual(set(kwargs), {"ip_adapter_image"})
        self.assertEqual(kwargs["ip_adapter_image"].size, (768, 768))
        center = kwargs["ip_adapter_image"].getpixel((384, 384))
        corner = kwargs["ip_adapter_image"].getpixel((0, 0))
        self.assertGreater(center[1], center[0])
        self.assertGreater(corner[0], 80)
        self.assertGreater(corner[2], 80)
        self.assertEqual(identity_conditioning_kwargs(request, []), {})

    def test_contextual_identity_scale_prioritizes_new_scene(self):
        contextual = type("Request", (), {"mode": "contextual", "identity_adapter_scale": 0.65})()
        create = type("Request", (), {"mode": "create", "identity_adapter_scale": 0.65})()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(contextual_identity_adapter_scale(contextual), 0.1)
            self.assertEqual(contextual_identity_adapter_scale(create), 0.65)

    def test_pose_control_layout_is_two_person_and_deterministic(self):
        image = build_pose_control_image(896, 1152, "I aim my dick at your mouth")
        self.assertEqual(image.size, (896, 1152))
        self.assertEqual(image.mode, "RGB")
        self.assertGreater(len(set(image.getdata())), 10)
        # The partial user body starts at the neck/shoulders; the head and
        # facial keypoints are intentionally absent from the control map.
        self.assertEqual(image.getpixel((int(0.10 * 896), int(0.78 * 1152))), (0, 0, 0))


if __name__ == "__main__":
    unittest.main()
