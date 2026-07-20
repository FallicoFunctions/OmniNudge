import { parseOmniChatMessage } from '../../utils/omnichatMessageFormatting';

export default function OmniChatMessageContent({ content }: { content: string }) {
  const segments = parseOmniChatMessage(content);
  if (segments.length === 0) {
    return null;
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, index) => (
        <span
          key={index}
          className={`${segment.bold ? 'font-semibold' : ''} ${
            segment.italic ? 'italic text-white/55' : ''
          }`.trim()}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}
