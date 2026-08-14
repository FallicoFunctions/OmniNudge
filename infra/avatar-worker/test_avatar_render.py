import unittest

from .avatar_render import render_frame


class AvatarRenderTests(unittest.TestCase):
    def test_render_frame_is_fixed_size_and_changes_talking_state(self):
        from PIL import Image
        from io import BytesIO

        source = BytesIO()
        Image.new("RGB", (32, 32), (255, 0, 0)).save(source, format="PNG")
        quiet = render_frame(source.getvalue(), talking=False, width=64, height=64)
        talking = render_frame(source.getvalue(), talking=True, width=64, height=64)
        self.assertEqual(len(quiet), 64 * 64 * 3)
        self.assertEqual(len(talking), 64 * 64 * 3)
        self.assertNotEqual(quiet, talking)

    def test_empty_avatar_uses_bounded_fallback_frame(self):
        frame = render_frame(b"", talking=False, width=32, height=24)
        self.assertEqual(len(frame), 32 * 24 * 3)


if __name__ == "__main__":
    unittest.main()
