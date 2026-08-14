import { describe, expect, it } from 'vitest';
import {
  getOmniChatPreviewText,
  normalizeOmniChatMessageContent,
  parseOmniChatMessage,
} from '../omnichatMessageFormatting';

describe('normalizeOmniChatMessageContent', () => {
  it('removes leading and trailing blank space from bot messages', () => {
    expect(normalizeOmniChatMessageContent('\n\n*Malachar watches.*\n\n')).toBe(
      '*Malachar watches.*'
    );
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

  it('repairs quote-formatted assistant dialogue and marks surrounding prose as narration', () => {
    expect(
      parseOmniChatMessage(
        '*She lifts her hand.*\nThe denim is warm beneath her fingertips.\n\n"Feels... solid," *she says quietly.*',
        { repairAssistantFormatting: true }
      )
    ).toEqual([
      { text: 'She lifts her hand.', bold: false, italic: true },
      {
        text: '\nThe denim is warm beneath her fingertips.\n\n',
        bold: false,
        italic: true,
      },
      { text: 'Feels... solid,', bold: false, italic: false },
      { text: ' ', bold: false, italic: true },
      { text: 'she says quietly.', bold: false, italic: true },
    ]);
  });

  it('repairs straight single-quoted dialogue without stripping contractions', () => {
    expect(
      parseOmniChatMessage("*I pause.*\n\n'Feels solid,' *I say quietly.* I’m still here.", {
        repairAssistantFormatting: true,
      })
    ).toEqual([
      { text: 'I pause.', bold: false, italic: true },
      { text: '\n\n', bold: false, italic: true },
      { text: 'Feels solid,', bold: false, italic: false },
      { text: ' ', bold: false, italic: true },
      { text: 'I say quietly.', bold: false, italic: true },
      { text: ' I’m still here.', bold: false, italic: false },
    ]);

    expect(parseOmniChatMessage("'I'm still here.'", { repairAssistantFormatting: true })).toEqual([
      { text: "I'm still here.", bold: false, italic: false },
    ]);
  });

  it('removes dialogue quotes after sentence punctuation while preserving the preceding sentence', () => {
    expect(
      parseOmniChatMessage("I pause. 'We can slow down and talk honestly.'", {
        repairAssistantFormatting: true,
      })
    ).toEqual([
      { text: 'I pause. ', bold: false, italic: true },
      { text: 'We can slow down and talk honestly.', bold: false, italic: false },
    ]);
  });

  it('does not italicize ordinary speech that introduces a quoted legacy phrase', () => {
    expect(
      parseOmniChatMessage('Well, "we can slow down and talk honestly."', {
        repairAssistantFormatting: true,
      })
    ).toEqual([
      { text: 'Well, ', bold: false, italic: false },
      { text: 'we can slow down and talk honestly.', bold: false, italic: false },
    ]);
  });

  it('does not alter quotation marks in user-authored text', () => {
    expect(parseOmniChatMessage('I said "leave it alone."')).toEqual([
      { text: 'I said "leave it alone."', bold: false, italic: false },
    ]);
  });

  it('repairs obvious unmarked narration without turning ordinary dialogue italic', () => {
    const content =
      'My breath hitches, and I force myself to hold my hand steady, tracing along the seam of your jeans.\n\n' +
      'You’re not even a little bit nervous? That’s compelling. I swallow, my gaze still locked on yours. You’re really going to make me doubt myself, aren’t you?\n\n' +
      'I say, my voice a little rough. My thumb brushes against the swell of your thigh, just below your… Are you absolutely sure about that?';

    expect(parseOmniChatMessage(content, { repairAssistantFormatting: true })).toEqual([
      {
        text: 'My breath hitches, and I force myself to hold my hand steady, tracing along the seam of your jeans.\n\n',
        bold: false,
        italic: true,
      },
      {
        text: 'You’re not even a little bit nervous? That’s compelling. ',
        bold: false,
        italic: false,
      },
      {
        text: 'I swallow, my gaze still locked on yours. ',
        bold: false,
        italic: true,
      },
      {
        text: 'You’re really going to make me doubt myself, aren’t you?\n\n',
        bold: false,
        italic: false,
      },
      {
        text: 'I say, my voice a little rough. My thumb brushes against the swell of your thigh, just below your… ',
        bold: false,
        italic: true,
      },
      {
        text: 'Are you absolutely sure about that?',
        bold: false,
        italic: false,
      },
    ]);
  });

  it('keeps ordinary first-person assistant speech unformatted', () => {
    const content =
      'I think we should keep talking honestly. My mother always told me direct questions are kinder.';

    expect(parseOmniChatMessage(content, { repairAssistantFormatting: true })).toEqual([
      { text: content, bold: false, italic: false },
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
