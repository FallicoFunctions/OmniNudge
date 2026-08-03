export type OmniChatMessageSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

type ParseOmniChatMessageOptions = {
  repairAssistantFormatting?: boolean;
};

const SENTENCE_PATTERN = /[^.!?]*[.!?]+(?:["')\]]+)?(?=\s|$)/g;

export function normalizeOmniChatMessageContent(content: string) {
  return content.trim();
}

function hasClosingMarker(content: string, marker: '*' | '**', fromIndex: number) {
  return content.indexOf(marker, fromIndex) !== -1;
}

const QUOTED_DIALOGUE_AT_LINE_START = /(^|\n)([ \t]*)["“]([^\n"”]+?)["”](?=\s|$)/gm;
const ASSISTANT_SENTENCE_PATTERN = /[^.!?…]+[.!?…]+["'”’)\]]*(?:\s+|$)|[^.!?…]+$/g;
const FIRST_PERSON_ACTION_NARRATION =
  /^i\s+(?:swallow|nod|shake|lean|smile|grin|sigh|pause|glance|reach|touch|brush|trace|move|slide|pull|press|lift|lower|tilt|turn|step|sit|stand|inhale|exhale|freeze|flinch|shrug|blink|bite|gesture)(?:\s+(?:back|closer|away|forward|in|out|up|down|over|toward|towards))?\s*[,;.!?]/i;
const FIRST_PERSON_SPEECH_TAG_NARRATION =
  /^i\s+(?:say|ask|reply|answer|whisper|murmur|add)\s*,/i;
const FIRST_PERSON_BODY_ACTION =
  /^i\s+(?:rest|place|lay|set|hold|keep|move|slide|brush|trace|press|lift|lower|pull|withdraw)\s+(?:my|a|the)\s+(?:hand|hands|finger|fingers|thumb|palm|arm|arms|foot|feet|knee|knees|head|shoulder|shoulders|body)\b/i;
const BODY_ACTION_NARRATION =
  /^my\s+(?:breath|hand|hands|finger|fingers|thumb|palm|palms|gaze|eyes|voice|heart|pulse|shoulder|shoulders|lips|mouth|head|body|foot|feet|knee|knees|chest|throat)\s+(?:hitch(?:es)?|catch(?:es)?|brush(?:es)?|trace(?:s)?|move(?:s)?|slide(?:s)?|pull(?:s)?|press(?:es)?|lift(?:s)?|lower(?:s)?|tilt(?:s)?|turn(?:s)?|tremble(?:s)?|shake(?:s)?|freeze(?:s)?|tighten(?:s)?|soften(?:s)?|drop(?:s)?|rise(?:s)?|races?|pound(?:s)?|hammer(?:s)?|lock(?:s)?|flick(?:s)?|drift(?:s)?|linger(?:s)?|hover(?:s)?|land(?:s)?|rest(?:s)?)\b/i;

function containsQuotedAssistantDialogue(segments: OmniChatMessageSegment[]) {
  return segments.some((segment) => {
    if (segment.italic) return false;
    QUOTED_DIALOGUE_AT_LINE_START.lastIndex = 0;
    return QUOTED_DIALOGUE_AT_LINE_START.test(segment.text);
  });
}

function repairQuotedAssistantDialogue(
  segments: OmniChatMessageSegment[]
): OmniChatMessageSegment[] {
  if (!containsQuotedAssistantDialogue(segments)) return segments;

  const repaired: OmniChatMessageSegment[] = [];
  const append = (text: string, bold: boolean, italic: boolean) => {
    if (!text) return;
    repaired.push({ text, bold, italic });
  };

  for (const segment of segments) {
    if (segment.italic) {
      append(segment.text, segment.bold, true);
      continue;
    }

    let cursor = 0;
    QUOTED_DIALOGUE_AT_LINE_START.lastIndex = 0;
    for (const match of segment.text.matchAll(QUOTED_DIALOGUE_AT_LINE_START)) {
      const matchIndex = match.index ?? 0;
      const quoteIndex = matchIndex + match[1].length + match[2].length;
      append(segment.text.slice(cursor, quoteIndex), false, true);
      append(match[3], false, false);
      cursor = matchIndex + match[0].length;
    }
    append(segment.text.slice(cursor), false, true);
  }

  return repaired;
}

function looksLikeUnmarkedNarration(sentence: string) {
  const trimmed = sentence.trim();
  if (!trimmed || trimmed.startsWith('"') || trimmed.startsWith('“')) return false;
  return (
    FIRST_PERSON_ACTION_NARRATION.test(trimmed) ||
    FIRST_PERSON_SPEECH_TAG_NARRATION.test(trimmed) ||
    FIRST_PERSON_BODY_ACTION.test(trimmed) ||
    BODY_ACTION_NARRATION.test(trimmed)
  );
}

function repairUnmarkedAssistantNarration(
  segments: OmniChatMessageSegment[]
): OmniChatMessageSegment[] {
  const repaired: OmniChatMessageSegment[] = [];

  for (const segment of segments) {
    if (segment.italic) {
      repaired.push(segment);
      continue;
    }

    ASSISTANT_SENTENCE_PATTERN.lastIndex = 0;
    const sentences = segment.text.match(ASSISTANT_SENTENCE_PATTERN);
    if (!sentences) {
      repaired.push(segment);
      continue;
    }
    const segmentParts: OmniChatMessageSegment[] = [];
    for (const sentence of sentences) {
      const italic = looksLikeUnmarkedNarration(sentence);
      const previous = segmentParts.at(-1);
      if (previous && previous.bold === segment.bold && previous.italic === italic) {
        previous.text += sentence;
      } else {
        segmentParts.push({ text: sentence, bold: segment.bold, italic });
      }
    }
    repaired.push(...segmentParts);
  }
  return repaired;
}

export function parseOmniChatMessage(
  content: string,
  options: ParseOmniChatMessageOptions = {}
): OmniChatMessageSegment[] {
  const normalizedContent = normalizeOmniChatMessageContent(content);
  const segments: OmniChatMessageSegment[] = [];
  let buffer = '';
  let bold = false;
  let italic = false;

  const flush = () => {
    if (!buffer) {
      return;
    }
    segments.push({ text: buffer, bold, italic });
    buffer = '';
  };

  for (let index = 0; index < normalizedContent.length; ) {
    if (normalizedContent.startsWith('**', index)) {
      if (bold) {
        flush();
        bold = false;
        index += 2;
        continue;
      }
      if (hasClosingMarker(normalizedContent, '**', index + 2)) {
        flush();
        bold = true;
        index += 2;
        continue;
      }
      index += 2;
      continue;
    }

    if (normalizedContent[index] === '*') {
      if (italic) {
        flush();
        italic = false;
        index += 1;
        continue;
      }
      if (hasClosingMarker(normalizedContent, '*', index + 1)) {
        flush();
        italic = true;
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    buffer += normalizedContent[index];
    index += 1;
  }

  flush();
  if (!options.repairAssistantFormatting) return segments;
  return repairUnmarkedAssistantNarration(repairQuotedAssistantDialogue(segments));
}

export function getOmniChatPreviewText(content: string, sentenceCount = 2) {
  const plainText = parseOmniChatMessage(content)
    .map((segment) => segment.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) {
    return '';
  }

  const sentenceMatches = plainText.match(SENTENCE_PATTERN);
  if (sentenceMatches && sentenceMatches.length > 0) {
    return sentenceMatches.slice(0, sentenceCount).join(' ').replace(/\s+/g, ' ').trim();
  }

  return plainText;
}
