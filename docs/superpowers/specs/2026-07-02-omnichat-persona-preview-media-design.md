# OmniChat Persona Preview Media

Date: 2026-07-02
Status: Proposed
Scope: OmniChat persona image/video authoring, delivery, and card preview behavior

## Goal

Add support for persona preview videos in OmniChat so each persona can have:

- a still avatar image used as the default poster
- a short preview video used for card previews

The first target surface is the OmniChat discover page. Desktop should support hover-to-preview across persona tiles. Mobile should support sequential autoplay for featured tiles only. The full workflow must include backend support, admin management support, frontend rendering, and QA coverage.

## Non-Goals

This work does not include:

- autoplay for non-featured mobile tiles
- generating the poster image from the uploaded video client-side
- redesigning the rest of OmniChat card layout
- adding audio playback for preview videos
- broad media gallery changes outside persona preview usage

## Product Requirements

### Persona Media Model

Each persona should support two independent media assets:

1. `avatar_url`
2. `preview_video_url`

`avatar_url` remains the default still image for all persona surfaces. `preview_video_url` is optional and only used for preview-capable surfaces.

If `preview_video_url` is absent or fails to load, the UI must fall back cleanly to the poster image.

### Desktop Behavior

On desktop persona tiles:

- default state shows the poster image
- hovering a tile starts the preview video automatically
- preview video is muted, looped, and inline
- leaving the tile stops preview and returns to the poster

This behavior applies to both:

- featured horizontal `Find your next story` tiles
- vertical persona tiles

### Mobile Behavior

Only featured tiles autoplay on mobile in v1.

Rules:

- autoplay is limited to the featured row
- only one featured tile plays at a time
- each visible featured tile plays once, then the next visible featured tile plays once
- the sequence repeats while the featured row remains visible
- autoplay is muted and inline
- non-featured vertical tiles remain poster-only on mobile

If only one featured tile is visible, it may replay after a short pause.

Autoplay should pause while the user is actively scrolling and resume once scrolling settles.

## Visual Behavior

### Featured Horizontal Tiles

Featured tiles are already horizontally proportioned. Preview videos should fill the tile naturally using full-bleed rendering.

### Vertical Tiles

Preview videos will be horizontal source media displayed inside vertical cards. The video must be center-cropped to fit the tile without letterboxing or black bars.

Required rendering behavior:

- `object-fit: cover`
- center alignment
- no visible empty space

The goal is consistent framing, not full uncropped video visibility.

## Data and API Design

### Backend Schema

Extend `bot_personas` with:

- `preview_video_url TEXT`

The field should be nullable.

### API Payloads

Persona API responses must include `preview_video_url`.

Any persona create/update endpoint used by admin management must accept `preview_video_url` updates alongside `avatar_url`.

### Storage

Preview videos should use the existing media/storage pipeline conventions where practical rather than introducing a separate storage system.

Accepted source of truth:

- uploaded and stored asset URL returned by backend-managed upload flow

## Admin Workflow

The full admin workflow means persona media can be managed through supported admin paths rather than manual database edits.

Requirements:

- admin surface can view the current avatar image
- admin surface can view whether a preview video exists
- admin can upload or replace the preview video
- admin can remove the preview video without deleting the avatar image
- admin can continue to manage avatar image independently

If the current codebase lacks a persona admin UI, the implementation may introduce the smallest admin editing surface needed for this workflow, but it must still be a real supported UI workflow.

## Frontend Component Design

### PersonaAvatar

`PersonaAvatar` should be extended so it can render:

- poster-only image fallback
- preview-capable image/video stack

It must remain reusable across existing OmniChat surfaces that already consume persona avatars.

The component should not autoplay video by itself globally. Interaction state should be driven by the calling surface so desktop hover and mobile sequencing remain explicit.

### Discover Cards

Featured and non-featured discover cards should pass the right preview mode into `PersonaAvatar`:

- desktop hover state for both card groups
- mobile autoplay sequencing state for featured cards only
- no mobile autoplay state for vertical tiles

## Interaction and Performance

Preview videos should be conservative in network and CPU usage.

Requirements:

- muted
- plays inline
- no eager playback of all cards
- avoid mounting or actively loading all videos at once if unnecessary
- use lightweight loading behavior such as deferred source attachment or `preload=\"metadata\"`

Mobile featured autoplay should only consider tiles that are actually visible enough to matter. Use viewport observation rather than blind sequential playback.

## Failure Handling

If a preview video:

- is missing
- fails to load
- stalls
- cannot autoplay under browser rules

the tile should remain usable and show the poster image without visible breakage.

No card should become blank or blocked due to video failure.

## Testing Strategy

### Backend

Add tests for:

- schema support for `preview_video_url`
- persona response serialization including `preview_video_url`
- admin persona update flow for preview video create/update/remove

### Frontend

Add tests for:

- poster fallback with no video
- desktop hover preview start/stop
- vertical card video render using cover-cropping assumptions
- featured mobile autoplay sequencing logic
- mobile non-featured cards remaining poster-only
- video failure fallback

### Browser QA

Validate in the browser:

- desktop featured hover preview
- desktop vertical hover preview
- mobile-sized viewport featured sequential autoplay
- no autoplay on mobile vertical cards
- no black bars in vertical preview cards

## Implementation Breakdown

1. Extend backend persona schema and API for `preview_video_url`.
2. Add or extend admin persona editing workflow for avatar and preview video management.
3. Extend frontend persona types and service payload handling.
4. Upgrade `PersonaAvatar` to support poster plus preview video rendering.
5. Add desktop hover preview for all discover persona tiles.
6. Add mobile sequential autoplay for featured tiles only.
7. Add tests and browser verification.

## Risks

### Admin Surface Availability

If no persona admin UI exists today, the work expands beyond a simple field addition. The plan should isolate a minimal persona-editing workflow rather than trying to build a large admin system.

### Mobile Motion Load

Sequential autoplay on mobile can become distracting or expensive if multiple videos are visible and source loading is uncontrolled. The implementation should keep only one active playback instance in the featured row.

### Browser Autoplay Variance

Mobile autoplay behavior depends on muted inline playback and careful state handling. The implementation should assume fallback-to-poster is acceptable when a browser refuses playback.

## Success Criteria

This work is complete when:

- a persona can be assigned an avatar image and preview video through a supported admin workflow
- desktop featured and vertical discover tiles preview video on hover
- mobile featured tiles autoplay sequentially one at a time
- mobile vertical tiles remain poster-only
- vertical previews crop horizontally sourced video cleanly with no black bars
- fallback to poster image works when preview video is absent or fails
