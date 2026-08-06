"""Private object-store output for RunPod workers."""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import BinaryIO
from urllib.parse import urlparse


class StorageError(RuntimeError):
    pass


_KEY_PART = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")


class ObjectStore:
    """Uploads completed files and returns short-lived HTTPS URLs.

    The worker never returns a local path.  S3-compatible endpoints are
    supported through boto3; a public base URL may be supplied when a private
    CDN signs the object independently.
    """

    def __init__(self) -> None:
        self.bucket = os.getenv("OMNICHAT_OUTPUT_BUCKET", "").strip()
        self.prefix = os.getenv("OMNICHAT_OUTPUT_PREFIX", "omnichat").strip("/")
        self.region = os.getenv("AWS_REGION", "us-east-1").strip()
        self.endpoint = os.getenv("S3_ENDPOINT", "").strip() or None
        self.public_base_url = os.getenv("OMNICHAT_OUTPUT_PUBLIC_BASE_URL", "").strip().rstrip("/")
        if self.public_base_url:
            parsed_public_url = urlparse(self.public_base_url)
            if (
                parsed_public_url.scheme != "https"
                or not parsed_public_url.hostname
                or parsed_public_url.username is not None
                or parsed_public_url.password is not None
                or parsed_public_url.query
                or parsed_public_url.fragment
            ):
                raise StorageError("output public base URL must be an HTTPS origin")
        try:
            configured_ttl = int(os.getenv("OMNICHAT_OUTPUT_URL_TTL_SECONDS", "900"))
        except (TypeError, ValueError) as exc:
            raise StorageError("output object URL TTL is invalid") from exc
        self.url_ttl = min(max(configured_ttl, 60), 3600)
        prefix_parts = self.prefix.split("/") if self.prefix else []
        if (
            not self.bucket
            or not prefix_parts
            or len(self.prefix) > 256
            or any(not _KEY_PART.fullmatch(part) for part in prefix_parts)
        ):
            raise StorageError("output object storage is not configured")
        self._client = None

    def _client_for_upload(self):
        if self._client is None:
            try:
                import boto3  # type: ignore
            except ImportError as exc:  # pragma: no cover - exercised in image
                raise StorageError("boto3 is not installed") from exc
            self._client = boto3.client("s3", region_name=self.region, endpoint_url=self.endpoint)
        return self._client

    def upload(self, file_obj: BinaryIO, *, suffix: str, content_type: str) -> tuple[str, int]:
        if suffix not in {".png", ".jpg", ".webp", ".mp4"}:
            raise StorageError("unsupported output suffix")
        key = f"{self.prefix}/{uuid.uuid4().hex}{suffix}"
        file_obj.seek(0, os.SEEK_END)
        size = file_obj.tell()
        file_obj.seek(0)
        if size <= 0:
            raise StorageError("generated output is empty")
        try:
            self._client_for_upload().upload_fileobj(
                file_obj,
                self.bucket,
                key,
                ExtraArgs={"ContentType": content_type, "ContentDisposition": "inline"},
            )
            if self.public_base_url:
                return f"{self.public_base_url}/{key}", size
            url = self._client_for_upload().generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=self.url_ttl,
            )
            if not url.startswith("https://"):
                raise StorageError("object store returned a non-HTTPS URL")
            return url, size
        except StorageError:
            raise
        except Exception as exc:  # pragma: no cover - provider-specific
            raise StorageError("generated output could not be uploaded") from exc

    def delete(self, key: str) -> None:
        if not key or ".." in Path(key).parts:
            return
        try:
            self._client_for_upload().delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            # Deletion is best effort; the application owns the durable copy.
            return
