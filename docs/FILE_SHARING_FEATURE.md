# File Sharing Feature

## Overview
OmniNudge messaging supports encrypted file sharing with backend validation, malware scanning, thumbnail generation, quota enforcement, and in-chat previews.

## Supported File Types
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Video: `video/mp4`, `video/webm`, `video/quicktime`
- Audio: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`
- Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Text: `text/plain`

## Backend Pipeline
1. Upload request hits media handlers (`/api/v1/media/upload`, `/api/v1/media/batch-upload`).
2. MIME/type checks and content-signature validation run before persistence.
3. Upload is stored and queued for asynchronous scanning/thumbnail jobs.
4. Virus scan state controls previewability and thumbnail eligibility.
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

## Security Notes
- Upload validation includes file type restrictions and anti-polyglot checks.
- Malware scanning is fail-closed when configured.
- Thumbnail generation only runs for scan-clean files.

## Testing Coverage
- Backend tests: quota rejection, storage usage endpoint, trigger accounting.
- Frontend tests: `FilePreview`, `AudioPlayer`, `PDFViewerModal`, `MediaUploadZone` acceptance/validation.
