# Reactions GIF Capture Guide (F1-011)

This guide defines the exact demo GIF needed to complete the remaining
documentation task for message reactions.

## Output Artifact

- Required file: `docs/assets/reactions-demo.gif`
- Target length: 12-20 seconds
- Target size: under 8 MB
- Aspect: desktop recording at 16:9 (recommended 1280x720)

## One-Take Script

Record a single continuous clip that shows all of the following in order:

1. Open `/messages` and enter a conversation with at least one message.
2. Hover a message and click the `Add reaction` button.
3. Pick an emoji from the picker.
4. Show the reaction pill appearing below the message.
5. Click the same reaction pill again to remove it.
6. Add the reaction again.
7. Hover/focus the reaction pill so the user tooltip appears.
8. Switch to mobile viewport (or responsive mode), tap the reaction pill.
9. Show the mobile reaction details modal with usernames.
10. Close the modal.

## Visual Quality Rules

- Use a clean test account and conversation (no sensitive data).
- Keep cursor movement deliberate and slow enough to follow.
- Avoid browser UI clutter (hide bookmarks/sidebar).
- Use default/light theme unless a design review requests otherwise.

## Capture Tips

- macOS: QuickTime `File -> New Screen Recording`.
- Stop recording and trim start/end in QuickTime.
- Convert to GIF with your preferred tool if needed.

## Done Criteria

All items must be true:

- File exists at `docs/assets/reactions-demo.gif`.
- Playback clearly shows add/remove + tooltip + mobile details modal.
- Size is practical for docs viewing (prefer <8 MB).

