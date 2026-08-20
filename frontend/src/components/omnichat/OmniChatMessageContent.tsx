import {
  parseOmniChatMessage,
  type OmniChatMessageSegment,
} from '../../utils/omnichatMessageFormatting';

function segmentClassName(segment: OmniChatMessageSegment) {
  return [
    segment.bold ? 'font-semibold' : '',
    segment.italic ? 'italic text-white/55' : segment.emphasis ? 'italic' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default function OmniChatMessageContent({
  content,
  isAssistant = false,
}: {
  content: string;
  isAssistant?: boolean;
}) {
  const segments = parseOmniChatMessage(content, {
    repairAssistantFormatting: isAssistant,
  });
  if (segments.length === 0) {
    return null;
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, index) => (
        <span key={index} className={segmentClassName(segment)}>
          {segment.text}
        </span>
      ))}
    </p>
  );
}
