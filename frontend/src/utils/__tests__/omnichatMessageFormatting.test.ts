import { describe, expect, it } from 'vitest';
import {
  getOmniChatPreviewText,
  normalizeOmniChatMessageContent,
  parseOmniChatMessage,
} from '../omnichatMessageFormatting';

describe('normalizeOmniChatMessageContent', () => {
  it('removes leading and trailing blank space from bot messages', () => {
    expect(normalizeOmniChatMessageContent('\n\n*Malachar watches.*\n\n')).toBe('*Malachar watches.*');
  });
});

describe('parseOmniChatMessage', () => {
  it('renders bold and italic spans without exposing markdown markers', () => {
    expect(parseOmniChatMessage('**"Yes, goddess."** *Kneel.*')).toEqual([
      { text: '"Yes, goddess."', bold: true, italic: false },
      { text: ' ', bold: false, italic: false },
      { text: 'Kneel.', bold: false, italic: true },
    ]);
  });

  it('supports nested italic inside bold content', () => {
    expect(parseOmniChatMessage('**already *yielding* and waiting**')).toEqual([
      { text: 'already ', bold: true, italic: false },
      { text: 'yielding', bold: true, italic: true },
      { text: ' and waiting', bold: true, italic: false },
    ]);
  });

  it('drops unmatched markdown markers instead of displaying hanging asterisks', () => {
    expect(parseOmniChatMessage('**"Begin Training. *Now*.')).toEqual([
      { text: '"Begin Training. ', bold: false, italic: false },
      { text: 'Now', bold: false, italic: true },
      { text: '.', bold: false, italic: false },
    ]);
  });

  it('does not render a leading blank segment when content starts with newlines', () => {
    expect(parseOmniChatMessage('\n\n*Malachar watches.*')).toEqual([
      { text: 'Malachar watches.', bold: false, italic: true },
    ]);
  });
});

describe('getOmniChatPreviewText', () => {
  it('strips markdown markers before building the preview text', () => {
    expect(getOmniChatPreviewText('**"Yes, goddess."** *Your breath slows.*')).toBe(
      '"Yes, goddess." Your breath slows.'
    );
  });

  it('returns the first two sentences even when the second ends with a closing quote', () => {
    expect(
      getOmniChatPreviewText(
        '**"Yes, goddess. I understand - I am yours in this moment and beyond."** *Your breath slows.*'
      )
    ).toBe('"Yes, goddess. I understand - I am yours in this moment and beyond."');
  });
});
