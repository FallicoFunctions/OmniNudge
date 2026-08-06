"""LiveKit avatar worker launched in an on-demand RunPod Pod.

The API creates a room and passes this worker a short-lived LiveKit token.
The browser sends assistant turns as reliable data packets on the
``omnichat.assistant`` topic. The worker synthesizes those turns locally with
Kokoro and publishes audio plus a lightweight talking avatar video track.
No provider API key or LiveKit signing secret is placed in the container.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import posixpath
import signal
import socket
from urllib.parse import urlparse
from urllib.request import HTTPErrorProcessor, HTTPRedirectHandler, Request, build_opener
from pathlib import Path
from typing import Any

from .avatar_render import render_frame


LOG = logging.getLogger("omnichat.avatar")
TOPIC = "omnichat.assistant"
MAX_TEXT_CHARS = 8_000
VIDEO_WIDTH = 640
VIDEO_HEIGHT = 640
VIDEO_FPS = 15
MAX_AVATAR_BYTES = 25 * 1024 * 1024


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def _payload_from_event(*args: Any) -> bytes:
    if not args:
        return b""
    first = args[0]
    if isinstance(first, (bytes, bytearray, memoryview)):
        return bytes(first)
    value = getattr(first, "data", None)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)
    return b""


def _input_hosts() -> set[str]:
    hosts = {
        item.strip().lower().rstrip(".").lstrip(".")
        for item in os.getenv("OMNICHAT_INPUT_HOSTS", "storage.googleapis.com").split(",")
        if item.strip()
    }
    backend = urlparse(os.getenv("OMNICHAT_BACKEND_URL", "").strip())
    if backend.scheme == "https" and backend.hostname and backend.username is None and backend.password is None and not backend.query and not backend.fragment:
        hosts.add(backend.hostname.lower().rstrip("."))
    return hosts


def _resolve_avatar_url(raw_url: str) -> str:
    trimmed = raw_url.strip()
    if not trimmed.startswith("/"):
        return trimmed
    if posixpath.normpath(trimmed) != trimmed or not trimmed.startswith("/uploads/"):
        raise RuntimeError("avatar image URL is not configured")
    backend = urlparse(os.getenv("OMNICHAT_BACKEND_URL", "").strip())
    if backend.scheme != "https" or not backend.hostname or backend.username is not None or backend.password is not None or backend.query or backend.fragment:
        raise RuntimeError("avatar image URL is not configured")
    return f"{backend.scheme}://{backend.netloc}{trimmed}"


def _download_avatar(raw_url: str) -> bytes:
    parsed = urlparse(_resolve_avatar_url(raw_url))
    host = (parsed.hostname or "").lower().rstrip(".")
    try:
        port = parsed.port
    except ValueError as exc:
        raise RuntimeError("avatar image URL is not configured") from exc
    if (
        parsed.scheme.lower() != "https"
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or port not in (None, 443)
        or not any(host == allowed for allowed in _input_hosts())
    ):
        raise RuntimeError("avatar image URL is not configured")
    try:
        addresses = socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise RuntimeError("avatar image host could not be resolved") from exc
    if not addresses:
        raise RuntimeError("avatar image host has no addresses")
    for _, _, _, _, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0])
        if not address.is_global or address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast:
            raise RuntimeError("avatar image host resolved to a forbidden network")

    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
            return None

    class NoHTTPError(HTTPErrorProcessor):
        def http_response(self, request, response):  # type: ignore[no-untyped-def]
            return response

        https_response = http_response

    request = Request(parsed.geturl(), headers={"Accept": "image/png,image/jpeg,image/webp"})
    try:
        with build_opener(NoRedirect(), NoHTTPError()).open(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError("avatar image request failed")
            length = int(response.headers.get("content-length", "0") or 0)
            if length > MAX_AVATAR_BYTES:
                raise RuntimeError("avatar image is too large")
            data = bytearray()
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_AVATAR_BYTES:
                    raise RuntimeError("avatar image is too large")
            return bytes(data)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError("avatar image request failed") from exc


class KokoroSpeech:
    def __init__(self) -> None:
        self.voice = os.getenv("KOKORO_VOICE", "af_heart")
        self.language = os.getenv("KOKORO_LANGUAGE", "a")
        self._pipeline = None

    def _load(self):
        if self._pipeline is None:
            try:
                from kokoro import KPipeline  # type: ignore
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError("kokoro is not installed") from exc
            self._pipeline = KPipeline(lang_code=self.language)
        return self._pipeline

    def synthesize(self, text: str) -> list[bytes]:
        pipeline = self._load()
        chunks: list[bytes] = []
        for _, _, audio in pipeline(text, voice=self.voice):
            array = audio.detach().cpu().numpy() if hasattr(audio, "detach") else audio
            # LiveKit AudioFrame accepts signed 16-bit PCM. Kokoro returns
            # normalized float32 samples, so convert explicitly rather than
            # handing the frame a four-byte float buffer.
            import numpy as np  # type: ignore

            pcm = np.clip(array, -1.0, 1.0)
            chunks.append((pcm * 32767.0).astype(np.int16).tobytes())
        if not chunks:
            raise RuntimeError("speech model returned no audio")
        return chunks


class AvatarWorker:
    def __init__(self, room: Any, avatar_image: bytes) -> None:
        self.room = room
        self.avatar_image = avatar_image
        self.speech = KokoroSpeech()
        self.audio_source = None
        self.video_source = None
        self._speaking = False
        self._speech_lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[Any]] = set()

    async def publish_tracks(self) -> None:
        from livekit import rtc  # type: ignore

        self.audio_source = rtc.AudioSource(24_000, 1)
        audio_track = rtc.LocalAudioTrack.create_audio_track("avatar-voice", self.audio_source)
        await self.room.local_participant.publish_track(audio_track)

        self.video_source = rtc.VideoSource(VIDEO_WIDTH, VIDEO_HEIGHT)
        video_track = rtc.LocalVideoTrack.create_video_track("avatar-video", self.video_source)
        await self.room.local_participant.publish_track(video_track)
        await self.publish_frame(talking=False)

    async def publish_frame(self, *, talking: bool) -> None:
        if self.video_source is None:
            return
        from livekit import rtc  # type: ignore

        pixels = render_frame(self.avatar_image, talking=talking, width=VIDEO_WIDTH, height=VIDEO_HEIGHT)
        frame = rtc.VideoFrame(VIDEO_WIDTH, VIDEO_HEIGHT, rtc.VideoBufferType.RGB24, pixels)
        self.video_source.capture_frame(frame)

    def on_data(self, *args: Any) -> None:
        packet = args[0] if args else None
        topic = getattr(packet, "topic", None)
        if isinstance(topic, str) and topic != TOPIC:
            return
        raw = _payload_from_event(*args)
        if len(raw) > MAX_TEXT_CHARS * 4:
            return
        try:
            message = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if not isinstance(message, dict) or message.get("type") != "assistant_text":
            return
        text = message.get("text")
        if not isinstance(text, str):
            return
        text = " ".join(text.split())[:MAX_TEXT_CHARS]
        if not text:
            return
        task = asyncio.create_task(self.speak(text))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def speak(self, text: str) -> None:
        if self.audio_source is None:
            return
        from livekit import rtc  # type: ignore

        # Browser turns can arrive while the previous Kokoro utterance is
        # still draining. Serialize them so audio frames never interleave and
        # the talking animation cannot be cleared by an older turn.
        async with self._speech_lock:
            self._speaking = True
            try:
                chunks = await asyncio.to_thread(self.speech.synthesize, text)
                for chunk in chunks:
                    if not chunk:
                        continue
                    samples = len(chunk) // 2
                    frame = rtc.AudioFrame(chunk, 24_000, 1, samples)
                    await self.audio_source.capture_frame(frame)
                    await self.publish_frame(talking=True)
                await self.publish_frame(talking=False)
            finally:
                self._speaking = False

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)


async def run() -> None:
    from livekit import rtc  # type: ignore

    url = _required("LIVEKIT_URL")
    token = _required("LIVEKIT_TOKEN")
    avatar_image = b""
    image_url = os.getenv("OMNICHAT_AVATAR_IMAGE_URL", "").strip()
    image_path = os.getenv("AVATAR_IMAGE_PATH", "").strip()
    if image_url:
        try:
            avatar_image = _download_avatar(image_url)
        except RuntimeError as exc:
            LOG.warning("avatar image could not be loaded; using fallback frame: %s", exc)
    elif image_path and Path(image_path).is_file():
        avatar_image = Path(image_path).read_bytes()
    if len(avatar_image) > MAX_AVATAR_BYTES:
        raise RuntimeError("avatar image is too large")

    room = rtc.Room()
    worker = AvatarWorker(room, avatar_image)
    room.on("data_received", worker.on_data)
    await room.connect(url, token, auto_subscribe=False)
    await worker.publish_tracks()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(signum, stop.set)
        except (NotImplementedError, RuntimeError):
            pass
    await stop.wait()
    await worker.close()
    await room.disconnect()


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        asyncio.run(run())
    except asyncio.CancelledError:
        return
    except Exception:
        LOG.exception("avatar worker stopped")
        raise


if __name__ == "__main__":
    main()
