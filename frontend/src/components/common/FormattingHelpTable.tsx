import { MarkdownRenderer } from './MarkdownRenderer';

const FORMATTING_EXAMPLES = [
  { input: '*italics*', output: '*italics*' },
  { input: '**bold**', output: '**bold**' },
  { input: '`inline code`', output: '`inline code`' },
  { input: '[OmniNudge!](https://omninudge.com)', output: '[OmniNudge!](https://omninudge.com)' },
  {
    input: '* item 1\n* item 2\n* item 3',
    output: '* item 1\n* item 2\n* item 3',
  },
  { input: '> quoted text', output: '> quoted text' },
  {
    input: '```\nconsole.log("Hello, OmniNudge!");\n```',
    output: '```\nconsole.log("Hello, OmniNudge!");\n```',
  },
  {
    input: '| Feature | Works? |\n| --- | --- |\n| Tables | ✅ |\n| Inline code | ✅ |',
    output: '| Feature | Works? |\n| --- | --- |\n| Tables | ✅ |\n| Inline code | ✅ |',
  },
  { input: '---', output: '---' },
  { input: '~~strikethrough~~', output: '~~strikethrough~~' },
  { input: 'super^script', output: 'super^script' },
];

export function FormattingHelpTable() {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="bg-[#fff9c4] text-[var(--color-text-primary)]">
          <th className="border border-[var(--color-border)] px-1 py-1 text-left font-semibold italic">
            you type:
          </th>
          <th className="border border-[var(--color-border)] px-1 py-1 text-left font-semibold italic">
            you see:
          </th>
        </tr>
      </thead>
      <tbody>
        {FORMATTING_EXAMPLES.map((example, index) => (
          <tr key={index} className="align-top">
            <td className="border border-[var(--color-border)] bg-white px-1 py-1 font-mono text-[11px] text-[var(--color-text-primary)]">
              <pre className="m-0 whitespace-pre-wrap text-[11px] leading-tight">
                {example.input}
              </pre>
            </td>
            <td className="border border-[var(--color-border)] bg-white px-1 py-1">
              <MarkdownRenderer content={example.output} className="leading-tight text-[var(--color-text-primary)]" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
