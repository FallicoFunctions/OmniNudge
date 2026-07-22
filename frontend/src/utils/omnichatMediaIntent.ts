import type { OmniChatMediaKind } from '../types/omnichat';

const DIRECT_VIDEO_REQUEST =
  /\b(?:send|show|make|create|generate|record|take)\s+(?:me\s+)?(?:a\s+)?(?:short\s+)?(?:video|clip)\b|\b(?:video|clip)\s+of\b/i;
const MOTION_REQUEST =
  /\bshow\s+(?:me\s+)?(?:this|that|the|our|current)\s+(?:scene|moment|place|activity)?[^.!?]{0,24}\bin\s+motion\b/i;
const DIRECT_IMAGE_REQUEST =
  /\b(?:send|show|take|make|create|generate)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|pic|picture|selfie|image)\b/i;
const APPEARANCE_REQUEST =
  /\bshow\s+me\s+(?:what\s+)?(?:(?:you(?:'re|\s+are)?)|your)[^.!?]{0,36}\b(?:wearing|outfit|look|appearance)\b/i;

// This detector intentionally requires request language near the media term.
// Merely discussing a picture or video must never spend a generation credit.
export function detectOmniChatMediaIntent(message: string): OmniChatMediaKind | null {
  const normalized = message.trim();
  if (!normalized) return null;
  if (DIRECT_VIDEO_REQUEST.test(normalized) || MOTION_REQUEST.test(normalized)) return 'video';
  if (DIRECT_IMAGE_REQUEST.test(normalized) || APPEARANCE_REQUEST.test(normalized)) return 'image';
  return null;
}
