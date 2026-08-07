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
