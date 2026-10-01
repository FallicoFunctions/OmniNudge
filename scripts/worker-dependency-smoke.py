"""Exercise installed worker dependencies on a CPU without fetching models."""

import argparse
import importlib
from pathlib import Path
import unittest


def smoke(kind: str) -> None:
    if kind in {"image", "video"}:
        # Import the real pipeline classes. pip's resolver cannot detect API
        # removals between transformers, diffusers and the container's torch.
        import torch
        from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image

        assert torch.__version__.startswith("2.7.1"), torch.__version__
        assert AutoPipelineForImage2Image and AutoPipelineForText2Image
        if kind == "image":
            import cv2

            cascade = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
            assert cascade.is_file(), f"Face detector data missing: {cascade}"
            assert not cv2.CascadeClassifier(str(cascade)).empty(), "Face detector cannot load"
        else:
            from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
            from diffusers.utils import export_to_video
            import ftfy

            assert AutoencoderKLWan and WanImageToVideoPipeline and export_to_video
            assert ftfy.fix_text("test") == "test"
        modules = [importlib.import_module(f"infra.runpod.omnichat_worker.{name}")
                   for name in ("test_contract", "test_storage", "test_generators")]
    else:
        from livekit import rtc
        from kokoro import KPipeline

        assert rtc.AudioFrame and rtc.VideoFrame and KPipeline
        # Hyphenated directory is valid through importlib, unlike import syntax.
        modules = [importlib.import_module(f"infra.avatar-worker.{name}")
                   for name in ("test_worker", "test_avatar_render")]
    suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromModule(module) for module in modules)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful() or result.testsRun == 0:
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("image", "video", "avatar"))
    smoke(parser.parse_args().kind)
