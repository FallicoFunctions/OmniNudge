export type OmniChatMessageSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

const SENTENCE_PATTERN = /[^.!?]*[.!?]+(?:["')\]]+)?(?=\s|$)/g;

export function normalizeOmniChatMessageContent(content: string) {
  return content.trim();
}

function hasClosingMarker(content: string, marker: '*' | '**', fromIndex: number) {
  return content.indexOf(marker, fromIndex) !== -1;
}

export function parseOmniChatMessage(content: string): OmniChatMessageSegment[] {
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
  return segments;
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
