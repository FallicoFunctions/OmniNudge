import { MarkdownRenderer } from './MarkdownRenderer';
import { useTranslation } from 'react-i18next';

const FORMATTING_EXAMPLES = [
  { input: '*italics*', output: '*italics*' },
  { input: '**bold**', output: '**bold**' },
  { input: '`inline code`', output: '`inline code`' },
  { input: '[Link](https://example.com)', output: '[Link](https://example.com)' },
  {
    input: '* item 1\n* item 2\n* item 3',
    output: '* item 1\n* item 2\n* item 3',
  },
  { input: '> quoted text', output: '> quoted text' },
  {
    input: '```\nconsole.log("Hello!");\n```',
    output: '```\nconsole.log("Hello!");\n```',
  },
  {
    input: '| Feature | Works? |\n| --- | --- |\n| Tables | ✅ |\n| Inline code | ✅ |',
    output: '| Feature | Works? |\n| --- | --- |\n| Tables | ✅ |\n| Inline code | ✅ |',
  },
  { input: '---', output: '---' },
  { input: '~~strikethrough~~', output: '~~strikethrough~~' },
  { input: 'super^script', output: 'super^script' },
];

// REDDIT-5: Improved formatting help table with better spacing and readability
export function FormattingHelpTable() {
  const { t } = useTranslation();

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="bg-[#fff9c4] text-[var(--color-text-primary)]">
          <th className="border border-[var(--color-border)] px-3 py-2 text-left font-semibold italic">
            {t('common.formattingHelpTable.youType')}
          </th>
          <th className="border border-[var(--color-border)] px-3 py-2 text-left font-semibold italic">
            {t('common.formattingHelpTable.youSee')}
          </th>
        </tr>
      </thead>
      <tbody>
        {FORMATTING_EXAMPLES.map((example, index) => (
          <tr key={index} className={`align-top ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
            <td className="border border-[var(--color-border)] px-3 py-2 font-mono text-[11px] text-[var(--color-text-primary)]">
              <pre className="m-0 whitespace-pre-wrap text-[11px] leading-tight bg-gray-100 rounded px-2 py-1">
                {example.input}
              </pre>
            </td>
            <td className="border border-[var(--color-border)] px-3 py-2">
              <MarkdownRenderer
                content={example.output}
                className="leading-tight text-[var(--color-text-primary)]"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
