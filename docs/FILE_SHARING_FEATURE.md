# File Sharing Feature

## Overview
OmniNudge messaging supports encrypted file sharing with backend validation, malware scanning, thumbnail generation, quota enforcement, and in-chat previews.

## Supported File Types
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Video: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`
- Audio: `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/ogg`, `audio/webm`, `audio/opus`
- Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Text/Archives: `text/plain`, `application/zip`, `application/x-zip-compressed`

## Backend Pipeline
1. Upload request hits media handlers (`/api/v1/media/upload`, `/api/v1/media/batch-upload`).
2. MIME/type checks and content-signature validation run before persistence.
3. Upload is stored and queued for asynchronous scanning/thumbnail jobs.
4. Thumbnail jobs:
   - Image: generated from source image (`_thumb.jpg` up to 800x600 + `_thumb_sm.jpg` up to 200x200, JPEG-optimized with <50KB target)
   - Video: ffmpeg frame extraction at ~1s
   - PDF: first-page render to JPEG
5. Virus scan state controls previewability and thumbnail eligibility.
5. User storage usage is tracked in `users.storage_used_bytes` and quota-enforced pre-upload.

## Quota Model
- Default free-tier quota: `1GB` (`MEDIA_FREE_TIER_QUOTA_BYTES`)
- Elevated quota: `50GB` (`MEDIA_PRO_TIER_QUOTA_BYTES`)
- Usage endpoint: `GET /api/v1/users/me/storage`
- Response shape:
  - `used` (bytes)
  - `quota` (bytes)
  - `percentage` (0-100)

## Frontend Experience
- Upload surface accepts media + document types via `MediaUploadZone`.
- Message attachments render via `FilePreview`:
  - Images and videos inline.
  - Audio via `AudioPlayer` (play/pause, seek, speed, download).
  - PDFs via `PDFViewerModal` (modal viewer, navigation, zoom, download).
  - Other files with open/download affordances.

## Thumbnail Access
- Endpoint: `GET /api/v1/files/:id/thumbnail`
- Auth required and ownership/role-checked (owner, admin, moderator).
- Returns:
  - `307` redirect to thumbnail URL when available and scan status is clean.
  - `423` while scan is pending.
  - `410` for infected files.
  - `404` when no thumbnail exists.
- Thumbnail asset responses include long-lived cache headers (`max-age=2592000`) for `_thumb`/`_pdfthumb` files.

## Security Notes
- Upload validation includes file type restrictions and anti-polyglot checks.
- Malware scanning is fail-closed when configured.
- Thumbnail generation only runs for scan-clean files.

## Testing Coverage
- Backend tests: quota rejection, storage usage endpoint, trigger accounting.
- Frontend tests: `FilePreview`, `AudioPlayer`, `PDFViewerModal`, `MediaUploadZone` acceptance/validation.
