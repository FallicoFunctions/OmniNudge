import os
import unittest
from pathlib import Path
from unittest.mock import patch

from . import generators as generator_module
from .generators import (
    DEFAULT_IMAGE_NEGATIVE_PROMPT,
    ImageGenerator,
    ModelError,
    _validate_download_url,
    build_image_negative_prompt,
    build_image_prompt,
    build_ip_adapter_images,
    contextual_image_strength,
    identity_adapter_scale,
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

    def test_image_default_model_is_a_publicly_downloadable_photoreal_checkpoint(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ImageGenerator().model_id, "SG161222/RealVisXL_V5.0")
        with patch.dict(os.environ, {"OMNICHAT_IMAGE_MODEL_ID": "other/checkpoint"}, clear=True):
            self.assertEqual(ImageGenerator().model_id, "other/checkpoint")

    def test_photoreal_checkpoints_use_lower_guidance_than_sdxl_base(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(image_pipeline_settings("SG161222/RealVisXL_V5.0"), (30, 5.0, 0.55))

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

    def test_create_mode_passes_the_request_through(self):
        prompt = build_image_prompt("Sadie standing on the beach in a red bikini")
        self.assertTrue(prompt.startswith("A single coherent photorealistic image."))
        self.assertIn("Sadie standing on the beach in a red bikini", prompt)

    def test_contextual_prompt_serializes_structured_scene_state(self):
        scene = {
            "location": "a stone-walled basement dungeon with iron rings bolted to the wall and one caged bulb",
            "activity": "kneeling on the concrete",
            "outfit": "a black leather harness; wrists bound behind her back",
            "accessories": ["leather collar", "flogger"],
            "pose": "kneeling upright with her shoulders back",
            "expression": "steady eye contact",
            "mood": "tense and focused",
            "lighting": "a single caged bulb overhead",
            "recent_events": ["she lowers herself to the floor"],
        }
        prompt = build_image_prompt("Show the current scene as a candid photo.", "contextual", scene)
        # The 77-token CLIP window is a budget, spent highest-value first.
        # Outfit, accessories and expression are what users notice missing;
        # lighting and raw transcript are the first things dropped.
        self.assertIn("a black leather harness; wrists bound behind her back", prompt)
        self.assertIn("leather collar, flogger", prompt)
        self.assertIn("steady eye contact", prompt.lower())
        self.assertIn("kneeling upright with her shoulders back", prompt)
        # Location is capped so it cannot starve outfit/action/camera; it is
        # present but may be truncated at a clause boundary.
        self.assertIn("stone-walled basement dungeon", prompt)
        self.assertLessEqual(
            len(prompt.split()), 58, f"prompt exceeds the CLIP budget: {prompt}"
        )

    def test_prompt_budget_depends_on_whether_chunked_encoding_is_available(self):
        # Without chunking, CLIP discards everything past ~77 tokens, so the
        # builder must ration. With chunking the ceiling is lifted and the full
        # room description survives.
        scene = {
            "location": "Room with black and red floors, walls, and ceiling; multiple closets; "
            "walls lined with hooks holding toys, whips, ropes, and chains; bed with headboard",
            "activity": "playing with breasts",
            "outfit": "black latex bodysuit with red lace trim",
            "accessories": ["gold hoop earrings", "leather flogger", "velvet ribbon", "jewelry clip"],
            "pose": "leaning forward over the bed",
            "expression": "almost but not quite disapproving",
            "mood": "playful",
        }
        with patch.dict(os.environ, {"OMNICHAT_LONG_PROMPT": "0"}, clear=True):
            truncated = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertLessEqual(len(truncated.split()), 58, truncated)
        for required in ("black latex bodysuit", "gold hoop earrings", "disapproving"):
            self.assertIn(required, truncated.lower(), f"{required!r} budgeted out of: {truncated}")

        with patch.dict(os.environ, {"OMNICHAT_LONG_PROMPT": "1"}, clear=True):
            full = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertGreater(len(full.split()), 58)
        self.assertIn("hooks holding toys, whips, ropes, and chains", full)
        self.assertIn("gold hoop earrings", full)

    def test_worn_accessories_outrank_held_props_within_the_budget(self):
        # The accessory list is capped, and held props previously crowded out
        # jewellery the user had explicitly established in the roleplay.
        scene = {
            "location": "a bedroom",
            "accessories": ["leather flogger", "velvet ribbon", "jewelry clip", "gold hoop earrings"],
        }
        prompt = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertIn("gold hoop earrings", prompt)

    def test_specified_outfit_and_expression_are_defended_in_the_negative_prompt(self):
        # An adult-tuned checkpoint renders nude and smiling by default.
        scene = {"location": "a bedroom", "outfit": "a red silk robe", "expression": "furious"}
        negative = build_image_negative_prompt("", "contextual", "", scene)
        self.assertIn("nude", negative)
        self.assertIn("smiling", negative)
        bare = build_image_negative_prompt("", "contextual", "", {"location": "a bedroom"})
        self.assertNotIn("nude", bare)
        smiling = build_image_negative_prompt(
            "", "contextual", "", {"location": "a bedroom", "expression": "a warm smile"}
        )
        self.assertNotIn("smiling", smiling)

    def test_contextual_scene_defaults_to_the_persona_alone(self):
        scene = {"location": "a stone dungeon", "activity": "watching from across the room"}
        prompt = build_image_prompt("Show me what she is wearing.", "contextual", scene)
        # Solo framing is enforced from the negative prompt. Negative-space
        # instructions in the positive prompt burn the 77-token budget without
        # steering a diffusion model.
        self.assertNotIn("viewer", prompt)
        negative = build_image_negative_prompt("", "contextual", "", scene)
        self.assertIn("second subject", negative)
        self.assertNotIn("third person", negative)

    def test_contextual_scene_includes_the_viewer_only_when_the_server_says_so(self):
        scene = {"location": "a stone dungeon", "activity": "kneeling between", "include_user_body": True}
        prompt = build_image_prompt("Show the current scene.", "contextual", scene)
        self.assertIn("two people", prompt)
        self.assertIn("face out of frame", prompt)
        negative = build_image_negative_prompt("", "contextual", "", scene)
        self.assertIn("third person", negative)
        self.assertNotIn("second subject", negative)

    def test_location_words_no_longer_trigger_canned_scenes(self):
        # "dungeon" previously replaced the real location with a fixed masonry
        # paragraph and appended a two-person BDSM block to the negative prompt.
        scene = {"location": "a sunlit dungeon-themed escape room", "activity": "solving a puzzle"}
        prompt = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertIn("a sunlit dungeon-themed escape room", prompt)
        self.assertNotIn("rough masonry", prompt)
        self.assertNotIn("BDSM", prompt)
        negative = build_image_negative_prompt("", "contextual", "", scene)
        self.assertNotIn("casual street clothes", negative)
        self.assertNotIn("second woman", negative)

    def test_transcript_words_no_longer_decide_composition(self):
        scene = {
            "location": "a bedroom",
            "recent_events": ["User: I aim my dick at your mouth"],
        }
        prompt = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertNotIn("Exactly two adults", prompt)
        self.assertNotIn("crop his face out", prompt)
        self.assertNotIn("Two people", prompt)

    def test_recent_events_are_ordered_latest_first_and_bounded(self):
        # Recent events are now only a fallback for when structured pose and
        # expression are absent, and only the latest beat is spent on.
        scene = {"location": "a park", "recent_events": ["first beat", "second beat", "third beat", "fourth beat"]}
        prompt = build_image_prompt("Show the scene.", "contextual", scene)
        self.assertIn("fourth beat", prompt)
        self.assertNotIn("first beat", prompt)
        # Structured state wins over raw transcript when both exist.
        posed = build_image_prompt(
            "Show the scene.", "contextual", {**scene, "pose": "sitting on a bench"}
        )
        self.assertIn("sitting on a bench", posed)
        self.assertNotIn("fourth beat", posed)

    def test_default_negative_prompt_keeps_layout_defects_out(self):
        negative = build_image_negative_prompt("")
        self.assertEqual(negative, DEFAULT_IMAGE_NEGATIVE_PROMPT)
        self.assertIn("contact sheet", negative)
        self.assertIn("close-up portrait", negative)
        self.assertIn("reference image background", negative)
        self.assertIn("plastic skin", build_image_negative_prompt("plastic skin"))
        indoor = build_image_negative_prompt("", "contextual", "", {"location": "a bedroom"})
        self.assertIn("forest", indoor)
        outdoor = build_image_negative_prompt("", "contextual", "", {"location": "a park"})
        self.assertNotIn("forest, trees, foliage", outdoor)

    def test_prompts_never_assert_the_subject_is_human(self):
        # A reference may legitimately be anime art or an object, and the user
        # may want exactly that: "/image chair sits on top of mountain".
        created = build_image_prompt("chair sits on top of a mountain at sunset, clouds below")
        contextual = build_image_prompt(
            "Show the current scene.",
            "contextual",
            {"location": "a mountain summit", "activity": "resting on bare rock"},
        )
        for prompt in (created, contextual):
            lowered = prompt.lower()
            for banned in ("person", "character", "woman", " man ", "adult", "human"):
                self.assertNotIn(banned, lowered, f"{banned!r} leaked into: {prompt}")
        self.assertIn("chair sits on top of a mountain", created)
        # Tag-style contextual prompts name no subject noun at all, which is the
        # strongest form of not asserting the subject is human.
        self.assertIn("resting on bare rock", contextual)

    def test_identity_conditioning_is_background_minimized(self):
        from PIL import Image

        # The adapter also reads salient scenery, so an avatar photographed
        # outdoors would otherwise smuggle its background in as identity.
        references = [Image.new("RGB", (1200, 1600), "green")]
        with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": "0"}, clear=True):
            faces = build_ip_adapter_images(references)[0]
        self.assertEqual(faces[0].size, (768, 768))
        centre = faces[0].getpixel((384, 384))
        corner = faces[0].getpixel((0, 0))
        self.assertGreater(centre[1], centre[0], "subject survives the crop")
        self.assertGreater(corner[0], 80, "corner is matted toward neutral grey")
        self.assertGreater(corner[2], 80)

    def test_identity_scale_is_not_weakened_for_contextual_scenes(self):
        # Contextual scenes were clamped to the 0.1 floor, which switched
        # identity conditioning off for every "Scene photo". Background bleed is
        # handled by the reference crop, not by discarding the persona.
        contextual = type("Request", (), {"mode": "contextual", "identity_adapter_scale": 0.65})()
        create = type("Request", (), {"mode": "create", "identity_adapter_scale": 0.65})()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(identity_adapter_scale(contextual), 0.65)
            self.assertEqual(identity_adapter_scale(create), 0.65)

    def test_identity_scale_stays_bounded(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(identity_adapter_scale(type("R", (), {"mode": "contextual", "identity_adapter_scale": 9.0})()), 1.5)
            self.assertEqual(identity_adapter_scale(type("R", (), {"mode": "create", "identity_adapter_scale": 0.0})()), 0.1)

    def test_face_adapter_defaults_pair_with_the_vit_h_image_encoder(self):
        # A *_vit-h adapter loaded against the default sdxl_models encoder does
        # not raise; it silently produces weak identity conditioning.
        self.assertIn("plus-face", generator_module.DEFAULT_IP_ADAPTER_WEIGHT)
        self.assertIn("vit-h", generator_module.DEFAULT_IP_ADAPTER_WEIGHT)
        self.assertEqual(generator_module.DEFAULT_IP_ADAPTER_IMAGE_ENCODER, "models/image_encoder")

if __name__ == "__main__":
    unittest.main()


class LongPromptEncodingTests(unittest.TestCase):
    """Verify the CLIP-chunking maths without a GPU.

    torch is not installed locally, so a minimal stand-in records the shapes and
    token ids the encoder is handed. The invariants that matter are: no chunk
    exceeds the tokenizer's context, positive and negative end up the same
    sequence length, and both SDXL encoders are concatenated on the feature axis.
    """

    def _pipe(self, torch_stub):
        import types

        class Tok:
            model_max_length = 77
            bos_token_id, eos_token_id, pad_token_id = 1, 2, 0

            def __call__(self, text, truncation=False, add_special_tokens=False):
                # One id per character keeps the arithmetic obvious.
                return types.SimpleNamespace(input_ids=[5] * len(text))

        class Enc:
            def __init__(self, width):
                self.width = width
                self.seen = []

            def __call__(self, tensor, output_hidden_states=False):
                self.seen.append(list(tensor.data[0]))
                hidden = torch_stub.Tensor([[[0.0] * self.width] * len(tensor.data[0])])
                return types.SimpleNamespace(
                    hidden_states=[hidden, hidden, hidden],
                    __getitem__=lambda _s, _i: torch_stub.Tensor([[0.0] * self.width]),
                )

        pipe = types.SimpleNamespace(
            tokenizer=Tok(), tokenizer_2=Tok(),
            text_encoder=Enc(768), text_encoder_2=Enc(1280),
            _execution_device="cpu",
        )
        return pipe

    def test_chunking_splits_on_the_context_window(self):
        from .generators import _chunk_token_ids

        self.assertEqual(_chunk_token_ids([], 75), [[]])
        self.assertEqual(len(_chunk_token_ids(list(range(75)), 75)), 1)
        self.assertEqual(len(_chunk_token_ids(list(range(76)), 75)), 2)
        self.assertEqual(len(_chunk_token_ids(list(range(151)), 75)), 3)
        # No chunk may exceed the window, or CLIP would truncate it again.
        for chunk in _chunk_token_ids(list(range(400)), 75):
            self.assertLessEqual(len(chunk), 75)

    def test_long_prompt_flag_defaults_on_and_is_switchable(self):
        from .generators import long_prompt_enabled

        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(long_prompt_enabled())
        for off in ("0", "false", "off", "no"):
            with patch.dict(os.environ, {"OMNICHAT_LONG_PROMPT": off}, clear=True):
                self.assertFalse(long_prompt_enabled())


class IdentityReferenceFramingTests(unittest.TestCase):
    """The adapter is only as good as the crop it is handed.

    A 1920x1080 avatar under the old fixed geometry lost the chin and mouth and
    pushed the face to the frame edge, so the adapter matched a partial face.
    """

    def _canvas(self, width, height, colour=(90, 120, 60)):
        from PIL import Image

        return Image.new("RGB", (width, height), colour)

    def test_crop_to_face_centres_and_squares_the_frame(self):
        from .generators import _crop_to_face

        image = self._canvas(1920, 1080)
        out = _crop_to_face(image, (826, 208, 442, 442))
        self.assertEqual(out.size, (768, 768))

    def test_crop_to_face_stays_inside_the_source_at_the_edges(self):
        from .generators import _crop_to_face

        image = self._canvas(800, 600)
        for box in ((0, 0, 200, 200), (700, 500, 100, 100), (390, 290, 20, 20)):
            self.assertEqual(_crop_to_face(image, box).size, (768, 768))

    def test_detection_can_be_disabled_and_falls_back_to_geometry(self):
        from .generators import _detect_face_box, _focus_identity_reference

        image = self._canvas(1920, 1080)
        with patch.dict(os.environ, {"OMNICHAT_FACE_DETECT": "0"}, clear=True):
            self.assertIsNone(_detect_face_box(image))
            # The geometric path must still yield a usable adapter input, which
            # is what anime art and non-human references rely on.
            self.assertEqual(_focus_identity_reference(image).size, (768, 768))

    def test_reference_without_a_detectable_face_still_produces_a_crop(self):
        # A chair, a landscape, or anime art: no face, no error.
        image = self._canvas(1024, 1024, (30, 30, 30))
        from .generators import _focus_identity_reference

        self.assertEqual(_focus_identity_reference(image).size, (768, 768))


class MultiReferenceIdentityTests(unittest.TestCase):
    """Adapter images must match the loaded adapters exactly.

    Diffusers raises ValueError when ip_adapter_image length differs from the
    number of loaded IP-Adapters, which would fail every generation rather than
    degrade. Both lists are therefore derived from identity_adapter_weights().
    """

    def _images(self, count):
        from PIL import Image

        return [Image.new("RGB", (900, 1200), (90, 120, 60)) for _ in range(count)]

    def test_entry_count_always_matches_the_loaded_adapters(self):
        from .generators import build_ip_adapter_images, identity_adapter_weights

        for flag in ("1", "0"):
            with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": flag}, clear=True):
                for refs in (1, 3):
                    entries = build_ip_adapter_images(self._images(refs))
                    self.assertEqual(
                        len(entries), len(identity_adapter_weights()),
                        f"body_adapter={flag} refs={refs} would raise in diffusers",
                    )

    def test_body_adapter_adds_a_second_entry_and_can_be_disabled(self):
        from .generators import build_ip_adapter_images, body_adapter_enabled

        with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": "1"}, clear=True):
            self.assertTrue(body_adapter_enabled())
            self.assertEqual(len(build_ip_adapter_images(self._images(2))), 2)
        for off in ("0", "false", "off", "no"):
            with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": off}, clear=True):
                self.assertFalse(body_adapter_enabled())
                self.assertEqual(len(build_ip_adapter_images(self._images(2))), 1)

    def test_face_entry_repeats_the_anchor_and_keeps_the_extras(self):
        from .generators import build_ip_adapter_images

        with patch.dict(
            os.environ,
            {"OMNICHAT_BODY_ADAPTER": "0", "OMNICHAT_IDENTITY_ANCHOR_REPEAT": "2"},
            clear=True,
        ):
            faces = build_ip_adapter_images(self._images(3))[0]
        # anchor twice plus the two extras
        self.assertEqual(len(faces), 4)
        self.assertIs(faces[0], faces[1])

    def test_body_entry_preserves_proportions_rather_than_cropping(self):
        from .generators import _body_reference_image

        # A centre crop would distort the figure, which is the one thing this
        # adapter exists to convey.
        out = _body_reference_image(self._images(1)[0])
        self.assertEqual(out.size, (768, 768))

    def test_body_adapter_scale_stays_below_the_face_scale_by_default(self):
        from .generators import body_adapter_scale

        with patch.dict(os.environ, {}, clear=True):
            self.assertLess(body_adapter_scale(), 0.65)


class ReferenceRoutingTests(unittest.TestCase):
    """Close-up references sharpen the face; distant ones only inform the body.

    Feeding a full-length shot to the face adapter upscales a small face to
    768px and blurs the identity embedding, undoing the crop fix.
    """

    def _canvas(self, w, h):
        from PIL import Image

        return Image.new("RGB", (w, h), (90, 120, 60))

    def test_reference_with_no_detectable_face_stays_available(self):
        from .generators import _face_is_detailed_enough

        # Anime art and objects have no face; the geometric crop handles them.
        with patch.dict(os.environ, {"OMNICHAT_FACE_DETECT": "0"}, clear=True):
            self.assertTrue(_face_is_detailed_enough(self._canvas(800, 800)))

    def test_threshold_is_the_encoder_input_size_not_a_frame_ratio(self):
        from . import generators as gen

        image = self._canvas(1000, 1400)
        # CLIP consumes 224px. A 155px face crops to 325px natively at the 2.1
        # margin, so it is downscaled and loses nothing -- a full-length shot
        # still carries a usable face. A frame-ratio test wrongly rejected this.
        with patch.object(gen, "_detect_face_box", return_value=(400, 100, 155, 155)):
            with patch.dict(os.environ, {}, clear=True):
                self.assertTrue(gen._face_is_detailed_enough(image))
        # A genuinely tiny face would have to be upscaled, and is rejected.
        with patch.object(gen, "_detect_face_box", return_value=(400, 100, 40, 40)):
            with patch.dict(os.environ, {}, clear=True):
                self.assertFalse(gen._face_is_detailed_enough(image))

    def test_usable_body_shot_faces_reach_the_face_adapter(self):
        from . import generators as gen

        refs = [self._canvas(900, 900), self._canvas(1000, 1400), self._canvas(1000, 1400)]
        with patch.object(gen, "_detect_face_box", return_value=(300, 200, 155, 155)):
            with patch.dict(
                os.environ,
                {"OMNICHAT_BODY_ADAPTER": "1", "OMNICHAT_IDENTITY_ANCHOR_REPEAT": "2"},
                clear=True,
            ):
                bodies, faces = gen.build_ip_adapter_images(refs)
        self.assertEqual(len(bodies), 3, "every reference informs body shape")
        # anchor twice plus both body shots, whose faces are large enough
        self.assertEqual(len(faces), 4)

    def test_faces_too_small_to_encode_are_still_excluded(self):
        from . import generators as gen

        refs = [self._canvas(900, 900), self._canvas(1000, 1400)]
        def boxes(image):
            # Large face for the anchor, tiny for the distant shot. Called by
            # both the face-size and close-portrait checks, so keyed on size.
            return (300, 200, 420, 420) if image.size == (900, 900) else (400, 100, 30, 30)

        with patch.object(gen, "_detect_face_box", side_effect=boxes):
            with patch.dict(
                os.environ,
                {"OMNICHAT_BODY_ADAPTER": "1", "OMNICHAT_IDENTITY_ANCHOR_REPEAT": "2"},
                clear=True,
            ):
                bodies, faces = gen.build_ip_adapter_images(refs)
        # The anchor is a close portrait (face fills 47% of the frame), so it
        # carries no proportions and is kept out of the body adapter.
        self.assertEqual(len(bodies), 1, "only the full-length shot informs the body")
        self.assertEqual(len(faces), 2, "anchor only, repeated")

    def test_anchor_survives_even_when_every_face_is_small(self):
        from . import generators as gen

        refs = [self._canvas(1000, 1400), self._canvas(1000, 1400)]
        with patch.object(gen, "_detect_face_box", return_value=(400, 100, 80, 80)):
            with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": "1"}, clear=True):
                bodies, faces = gen.build_ip_adapter_images(refs)
        # Dropping every face reference would leave no identity at all.
        self.assertEqual(len(bodies), 2)
        self.assertGreaterEqual(len(faces), 1)


class OutfitAwareNegativePromptTests(unittest.TestCase):
    """Negate only the nudity the tracked outfit actually contradicts.

    Blanket-negating "topless" whenever any outfit was tracked told the model to
    cover a chest the scene had deliberately left bare, which is how an explicit
    g-string-only scene came back wearing a top.
    """

    def _negative(self, outfit):
        return build_image_negative_prompt(
            "", "contextual", "", {"location": "a bedroom", "outfit": outfit}
        )

    def test_lower_body_outfit_defends_the_bare_chest(self):
        for outfit in ("pink g-string thong", "black panties", "denim shorts", "sheer stockings"):
            negative = self._negative(outfit)
            self.assertIn("shirt, top, bra", negative, outfit)
            self.assertNotIn("topless", negative, f"{outfit!r} would gain an unwanted top")

    def test_torso_covering_outfit_still_defends_against_nudity(self):
        for outfit in ("black latex bodysuit", "a red silk robe", "leather corset", "bikini"):
            negative = self._negative(outfit)
            self.assertIn("topless", negative, outfit)
            self.assertNotIn("fully clothed", negative, outfit)


class FullFigureDefenceTests(unittest.TestCase):
    """A fuller build stated positively is overridden by the checkpoint's prior.

    Adult SDXL finetunes default to a slim fitness body. Saying "full curvy
    build" in the prompt loses that tie, so the slim terms are negated too --
    but only when the persona is actually described that way.
    """

    def _negative(self, appearance):
        return build_image_negative_prompt(
            "", "contextual", "", {"location": "a bedroom", "subject_appearance": appearance}
        )

    def test_full_figure_descriptions_negate_the_slim_prior(self):
        for appearance in (
            "41-year-old woman, full curvy build, soft untoned belly, wide hips",
            "plus size woman with thick thighs",
            "voluptuous, heavy bust",
        ):
            self.assertIn("slim, skinny", self._negative(appearance), appearance)

    def test_other_builds_are_left_alone(self):
        for appearance in ("25 year old athletic runner", "tall lean man", ""):
            self.assertNotIn("slim, skinny", self._negative(appearance), appearance)


class ModuleHygieneTests(unittest.TestCase):
    """Run pyflakes over the worker package.

    A duplicated def silently shadows the earlier one: the edited function
    still compiles and still passes syntax checks, while the stale version is
    what actually runs. That happened three times while building the identity
    pipeline, and each time the symptom was "my fix had no effect".

    pyflakes reports it as F811 redefinition. ruff does not flag this case, so
    the check is deliberately pyflakes and not the more common ruff.
    """

    def test_worker_package_passes_pyflakes(self):
        import pathlib
        import subprocess
        import sys

        package = pathlib.Path(generator_module.__file__).parent
        sources = sorted(str(p) for p in package.glob("*.py"))
        result = subprocess.run(
            [sys.executable, "-m", "pyflakes", *sources],
            capture_output=True, text=True,
        )
        if result.returncode == 1 and "No module named" in result.stderr:
            self.skipTest("pyflakes is not installed in this environment")
        self.assertEqual(result.returncode, 0, f"pyflakes findings:\n{result.stdout}")


class FaceDetectionReuseTests(unittest.TestCase):
    """Detect each reference's face once, not once per consumer.

    Haar detection costs ~284ms on a 2016x3072 photo. Three consumers each
    re-detected the same unmodified image, so six references cost 18 detections
    (~1.6s) per generation before the box was threaded through.
    """

    def test_one_detection_per_reference(self):
        from PIL import Image

        from . import generators as gen

        references = [Image.new("RGB", (1000, 1400), (90, 120, 60)) for _ in range(6)]
        seen = []

        def counting(image):
            seen.append(image)
            return (400, 300, 200, 200)

        with patch.object(gen, "_detect_face_box", side_effect=counting):
            with patch.dict(os.environ, {"OMNICHAT_BODY_ADAPTER": "1"}, clear=True):
                gen.build_ip_adapter_images(references)
        self.assertEqual(len(seen), len(references), "face detection is being repeated")

    def test_an_explicit_no_face_result_is_not_re_detected(self):
        from PIL import Image

        from . import generators as gen

        # None means "looked, found nothing" and must short-circuit; only the
        # _UNSET_BOX sentinel should trigger a fresh detection.
        image = Image.new("RGB", (800, 1200), (90, 120, 60))
        with patch.object(gen, "_detect_face_box", side_effect=AssertionError("re-detected")):
            self.assertFalse(gen._is_close_portrait(image, None))
            self.assertTrue(gen._face_is_detailed_enough(image, None))


class VideoFrameGeometryTests(unittest.TestCase):
    """Wan cannot sample an arbitrary frame count or frame size.

    num_frames must be 4k+1 for the temporal VAE, and both frame dimensions
    must be multiples of a model-specific granularity. Neither constraint
    raises when violated -- the pipeline crops or errors deep inside the
    transformer -- so both are computed here rather than trusted from a
    request.
    """

    def test_frame_count_is_always_a_legal_wan_length(self):
        from .generators import video_frame_count

        for duration in range(1, 11):
            for fps in (16, 24, 30):
                frames = video_frame_count(duration, fps, 121)
                self.assertEqual(frames % 4, 1, f"{duration}s at {fps}fps produced {frames} frames")
                self.assertGreaterEqual(frames, 5)
                self.assertLessEqual(frames, 121)

    def test_trained_length_is_reached_at_five_seconds(self):
        from .generators import video_frame_count

        self.assertEqual(video_frame_count(5, 24, 121), 121)

    def test_a_long_request_is_clamped_rather_than_honoured(self):
        # Quality degrades away from the trained length, so a ten-second ask
        # returns a good five-second clip instead of ten seconds of drift.
        from .generators import video_frame_count

        self.assertEqual(video_frame_count(10, 24, 121), 121)

    def test_a_short_request_scales_down(self):
        from .generators import video_frame_count

        self.assertEqual(video_frame_count(1, 24, 121), 25)

    def test_an_operator_ceiling_is_snapped_to_a_legal_length(self):
        # 100 is not 4k+1; honouring it verbatim would fail inside the VAE.
        from .generators import video_frame_count

        self.assertEqual(video_frame_count(10, 24, 100), 97)

    def test_frame_dimensions_follow_the_source_still(self):
        from .generators import video_frame_dimensions

        portrait_height, portrait_width = video_frame_dimensions(768, 1344, 32, 720 * 1280)
        self.assertGreater(portrait_height, portrait_width)
        landscape_height, landscape_width = video_frame_dimensions(1344, 768, 32, 720 * 1280)
        self.assertGreater(landscape_width, landscape_height)

    def test_frame_dimensions_are_multiples_of_the_pipeline_granularity(self):
        from .generators import video_frame_dimensions

        for mod_value in (16, 32):
            for size in ((1024, 1024), (768, 1344), (1344, 768), (896, 1152)):
                height, width = video_frame_dimensions(size[0], size[1], mod_value, 720 * 1280)
                self.assertEqual(height % mod_value, 0)
                self.assertEqual(width % mod_value, 0)
                self.assertLessEqual(height * width, 720 * 1280)

    def test_frame_dimensions_reject_an_unusable_source(self):
        from .generators import ModelError, video_frame_dimensions

        with self.assertRaises(ModelError):
            video_frame_dimensions(0, 1024, 32, 720 * 1280)
        with self.assertRaises(ModelError):
            video_frame_dimensions(1024, 1024, 0, 720 * 1280)

    def test_granularity_is_read_from_the_loaded_pipeline(self):
        from .generators import ModelError, _video_mod_value

        class _Transformer:
            config = type("_Config", (), {"patch_size": (1, 2, 2)})()

        class _Pipe:
            vae_scale_factor_spatial = 16
            transformer = _Transformer()

        self.assertEqual(_video_mod_value(_Pipe()), 32)
        with self.assertRaises(ModelError):
            _video_mod_value(object())


class VideoNegativePromptTests(unittest.TestCase):
    def test_stillness_is_never_penalised(self):
        # The prompt asks the subject to come to rest before the clip ends.
        # Penalising stillness at the same time is a contradiction, and the
        # clips that lost that argument stopped mid-gesture and blurred.
        from .generators import build_video_negative_prompt

        rendered = build_video_negative_prompt("")
        for banned in ("static image", "no motion", "frozen frame", "slideshow"):
            self.assertNotIn(banned, rendered)

    def test_motion_defects_are_still_covered(self):
        from .generators import build_video_negative_prompt

        rendered = build_video_negative_prompt("")
        for expected in ("morphing face", "jitter", "ghosting", "watermark"):
            self.assertIn(expected, rendered)

    def test_a_request_negative_prompt_is_appended(self):
        from .generators import build_video_negative_prompt

        self.assertTrue(build_video_negative_prompt("teeth").endswith(", teeth"))


class VideoOffloadTests(unittest.TestCase):
    GIB = 1024**3

    def test_only_a_very_large_card_keeps_the_pipeline_resident(self):
        from .generators import video_cpu_offload

        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(video_cpu_offload(80 * self.GIB))

    def test_a_forty_eight_gigabyte_card_still_offloads(self):
        # An A40 reports 44.43 GiB usable, and a resident pipeline reached
        # 42 GiB during sampling before running out of memory in the decode.
        # Holding this model on that card does not fit, and tiled decoding
        # cannot rescue it -- diffusers 0.35.1 skips Wan 2.2's patchify on the
        # tiled path and dies at encode.
        from .generators import video_cpu_offload

        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(video_cpu_offload(int(44.43 * self.GIB)))
            self.assertTrue(video_cpu_offload(24 * self.GIB))

    def test_the_operator_can_force_either_way(self):
        from .generators import video_cpu_offload

        with patch.dict(os.environ, {"OMNICHAT_VIDEO_CPU_OFFLOAD": "1"}, clear=True):
            self.assertTrue(video_cpu_offload(80 * self.GIB))
        with patch.dict(os.environ, {"OMNICHAT_VIDEO_CPU_OFFLOAD": "0"}, clear=True):
            self.assertFalse(video_cpu_offload(8 * self.GIB))

    def test_the_resident_threshold_is_tunable(self):
        from .generators import video_cpu_offload

        with patch.dict(os.environ, {"OMNICHAT_VIDEO_RESIDENT_MIN_VRAM_GB": "20"}, clear=True):
            self.assertFalse(video_cpu_offload(24 * self.GIB))

    def test_vae_tiling_is_never_enabled(self):
        # Wan 2.2's VAE patchifies 3 channels to 12 before its first conv, and
        # the tiled path in diffusers 0.35.1 bypasses that, failing at encode
        # with "expected input to have 12 channels, but got 3". Re-enabling
        # this to save memory costs a render and gains nothing.
        source = Path(__file__).with_name("generators.py").read_text()
        body = source.split("class VideoGenerator")[1]
        self.assertNotIn("enable_vae_tiling()", body)
        self.assertNotIn("vae.enable_tiling()", body)


class VideoGeneratorContractTests(unittest.TestCase):
    def test_default_model_is_the_single_gpu_wan_checkpoint(self):
        from .generators import VideoGenerator

        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(VideoGenerator().model_id, "Wan-AI/Wan2.2-TI2V-5B-Diffusers")
        with patch.dict(os.environ, {"OMNICHAT_VIDEO_IMAGE_MODEL_ID": "other/model"}, clear=True):
            self.assertEqual(VideoGenerator().model_id, "other/model")

    def test_a_video_request_without_a_source_still_is_a_contract_error(self):
        # The previous worker silently animated a persona reference photo here,
        # which rendered her in that photo's setting rather than the current
        # scene. There is no text-to-video path to fall back to any more.
        from .contract import validate_input
        from .generators import ModelError, VideoGenerator

        request = validate_input({"kind": "video", "mode": "create", "prompt": "she turns to look at you"})
        with self.assertRaises(ModelError):
            VideoGenerator().render(request)

    def test_there_is_no_text_to_video_pipeline_left(self):
        # Deleted rather than left unreachable: a text-to-video render has no
        # identity conditioning at all, so it must not survive as a fallback
        # that a later edit could quietly re-enable.
        import pathlib

        source = pathlib.Path(generator_module.__file__).read_text(encoding="utf-8")
        self.assertNotIn("WanPipeline", source)
        self.assertNotIn("OMNICHAT_VIDEO_TEXT_MODEL_ID", source)

    def test_motion_negative_prompt_keeps_the_request_text(self):
        from .generators import DEFAULT_VIDEO_NEGATIVE_PROMPT, build_video_negative_prompt

        self.assertEqual(build_video_negative_prompt("  "), DEFAULT_VIDEO_NEGATIVE_PROMPT)
        combined = build_video_negative_prompt("rain")
        self.assertTrue(combined.startswith(DEFAULT_VIDEO_NEGATIVE_PROMPT))
        self.assertTrue(combined.endswith("rain"))

    def test_motion_lora_is_off_until_the_endpoint_configures_one(self):
        from .generators import video_lora_settings

        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(video_lora_settings())
        with patch.dict(
            os.environ,
            {
                "OMNICHAT_VIDEO_LORA_MODEL_ID": "someone/motion-lora",
                "OMNICHAT_VIDEO_LORA_WEIGHT_NAME": "weights.safetensors",
                "OMNICHAT_VIDEO_LORA_SCALE": "0.55",
            },
            clear=True,
        ):
            self.assertEqual(video_lora_settings(), ("someone/motion-lora", "weights.safetensors", 0.55))

    def test_sampling_and_export_share_one_frame_rate(self):
        from .generators import video_fps

        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(video_fps(), 24)
        with patch.dict(os.environ, {"OMNICHAT_VIDEO_FPS": "16"}, clear=True):
            self.assertEqual(video_fps(), 16)


class VideoPreviewTests(unittest.TestCase):
    """The no-GPU preview must describe the video worker, not the image one.

    Rendering a video payload through build_image_prompt would print a
    convincing image prompt that the video worker never uses, which is worse
    than printing nothing.
    """

    def test_video_payload_reports_motion_and_sampled_length(self):
        from .preview import render

        # The input-host allowlist is ambient environment, and another test in
        # this package sets it. Pin it rather than inherit whatever ran first.
        with patch.dict(os.environ, {"OMNICHAT_INPUT_HOSTS": "storage.googleapis.com"}):
            output = render({
                "kind": "video",
                "mode": "image_to_video",
                "prompt": "she leans in",
                "duration_seconds": 10,
                "source_image_url": "https://storage.googleapis.com/omnichat/still.png",
            })
        self.assertIn("she leans in", output)
        self.assertIn("121 frames at 24fps", output)
        self.assertIn("clamped to the trained clip length", output)
        self.assertNotIn("photorealistic", output)

    def test_video_payload_without_a_source_is_reported_as_a_contract_error(self):
        from .contract import ContractError
        from .preview import render

        with self.assertRaises((SystemExit, ContractError)):
            render({"kind": "video", "mode": "image_to_video", "prompt": "she waves"})


class VideoRenderOutputTests(unittest.TestCase):
    """Drive render() past the pipeline call.

    Every other video test stops at the contract guard, which is exactly how a
    numpy-vs-list mistake in the frame handling shipped: the pipeline's output
    shape is never exercised without a GPU unless it is faked here.
    """

    def _render(self, frames, duration_seconds=5):
        import contextlib
        import pathlib
        import sys
        import types

        from PIL import Image

        from . import generators as gen
        from .contract import validate_input

        captured = {}

        def fake_export_to_video(frames_arg, path, fps=None):
            captured["frames"] = frames_arg
            captured["fps"] = fps
            pathlib.Path(path).write_bytes(b"fake-mp4")

        diffusers_module = types.ModuleType("diffusers")
        utils_module = types.ModuleType("diffusers.utils")
        utils_module.export_to_video = fake_export_to_video
        diffusers_module.utils = utils_module

        class _Pipe:
            vae_scale_factor_spatial = 16
            transformer = types.SimpleNamespace(config=types.SimpleNamespace(patch_size=(1, 2, 2)))

            def __call__(self, **kwargs):
                captured["kwargs"] = kwargs
                return types.SimpleNamespace(frames=frames)

        fake_torch = types.SimpleNamespace(
            Generator=lambda device=None: types.SimpleNamespace(manual_seed=lambda seed: None),
            inference_mode=contextlib.nullcontext,
        )

        with patch.dict(os.environ, {"OMNICHAT_INPUT_HOSTS": "storage.googleapis.com"}):
            request = validate_input({
                "kind": "video",
                "mode": "image_to_video",
                "prompt": "she leans in",
                "duration_seconds": duration_seconds,
                "source_image_url": "https://storage.googleapis.com/omnichat/still.png",
            })
        with patch.dict(sys.modules, {"diffusers": diffusers_module, "diffusers.utils": utils_module}), \
                patch.object(gen, "_download_image", return_value=Image.new("RGB", (1344, 768))), \
                patch.object(gen, "_device_dtype", return_value=(fake_torch, None)), \
                patch.object(gen.VideoGenerator, "_load", lambda self: _Pipe()), \
                patch.dict(os.environ, {}, clear=False):
            result = gen.VideoGenerator().render(request)
        self.addCleanup(lambda: pathlib.Path(result.file.name).unlink(missing_ok=True))
        return result, captured

    def test_numpy_batch_is_unwrapped_to_the_sampled_frames(self):
        import numpy as np

        # What diffusers actually returns for its default output_type="np":
        # (batch, num_frames, height, width, channels).
        frames = np.zeros((1, 121, 64, 64, 3), dtype=np.float32)
        result, captured = self._render(frames)

        self.assertEqual(len(captured["frames"]), 121, "the batch axis was passed through to the encoder")
        self.assertEqual(captured["fps"], 24)
        self.assertAlmostEqual(result.duration, 121 / 24, places=4)
        self.assertEqual(result.actual_prompt, "she leans in")

    def test_list_output_is_unwrapped_the_same_way(self):
        from PIL import Image

        frames = [[Image.new("RGB", (64, 64)) for _ in range(121)]]
        result, captured = self._render(frames)

        self.assertEqual(len(captured["frames"]), 121)
        self.assertAlmostEqual(result.duration, 121 / 24, places=4)

    def test_frame_size_and_count_reach_the_pipeline(self):
        import numpy as np

        _, captured = self._render(np.zeros((1, 121, 64, 64, 3), dtype=np.float32))
        kwargs = captured["kwargs"]
        # 1344x768 still, mod 32, 720*1280 budget.
        self.assertEqual(kwargs["height"] % 32, 0)
        self.assertEqual(kwargs["width"] % 32, 0)
        self.assertGreater(kwargs["width"], kwargs["height"])
        self.assertEqual(kwargs["num_frames"], 121)
        self.assertEqual(kwargs["image"].size, (kwargs["width"], kwargs["height"]))

    def test_an_empty_result_is_reported_as_no_frames(self):
        import numpy as np

        from .generators import ModelError

        for empty in (np.zeros((0, 121, 64, 64, 3), dtype=np.float32), [], None):
            with self.assertRaises(ModelError) as raised:
                self._render(empty)
            self.assertIn("no frames", str(raised.exception))
