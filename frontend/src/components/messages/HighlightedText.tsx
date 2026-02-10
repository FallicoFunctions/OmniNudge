/**
 * Component to highlight text matches in a string
 */
interface HighlightedTextProps {
  text: string;
  highlight: string;
  className?: string;
}

export function HighlightedText({ text, highlight, className }: HighlightedTextProps) {
  if (!highlight.trim()) {
    return <>{text}</>;
  }

  // Create a regex to find all occurrences of the highlight text (case-insensitive)
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        // Check if this part matches the highlight text
        const isMatch = regex.test(part);
        regex.lastIndex = 0; // Reset regex state

        if (isMatch) {
          return (
            <mark
              key={index}
              className="bg-yellow-300 text-[var(--color-text-primary)] font-semibold rounded px-0.5"
            >
              {part}
            </mark>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}
