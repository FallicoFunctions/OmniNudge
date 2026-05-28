import { useEffect, useState, type ComponentType } from 'react';
import type { Extension } from '@codemirror/state';

interface HubAIDesignCodeEditorProps {
  activeEditor: 'html' | 'css';
  htmlContent: string;
  cssContent: string;
  onHtmlChange: (value: string) => void;
  onCssChange: (value: string) => void;
}

const htmlSetup = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  highlightSpecialChars: true,
  foldGutter: true,
  drawSelection: true,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  syntaxHighlighting: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  rectangularSelection: true,
  crosshairCursor: false,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  closeBracketsKeymap: true,
  defaultKeymap: true,
  searchKeymap: true,
  historyKeymap: true,
  foldKeymap: true,
  completionKeymap: true,
  lintKeymap: true,
} as const;

const cssSetup = {
  lineNumbers: true,
  foldGutter: true,
  syntaxHighlighting: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  defaultKeymap: true,
  searchKeymap: true,
  historyKeymap: true,
  completionKeymap: true,
} as const;

interface EditorResources {
  CodeMirror: ComponentType<{
    value: string;
    height: string;
    extensions: Extension[];
    theme: Extension;
    onChange: (value: string) => void;
    basicSetup: typeof htmlSetup | typeof cssSetup;
  }>;
  extensions: Extension[];
  theme: Extension;
}

export default function HubAIDesignCodeEditor({
  activeEditor,
  htmlContent,
  cssContent,
  onHtmlChange,
  onCssChange,
}: HubAIDesignCodeEditorProps) {
  const [resources, setResources] = useState<EditorResources | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadEditor = async () => {
      const [{ default: CodeMirror }, themeModule] = await Promise.all([
        import('@uiw/react-codemirror'),
        import('@codemirror/theme-one-dark'),
      ]);

      const extensions =
        activeEditor === 'html'
          ? [(await import('@codemirror/lang-html')).html()]
          : [(await import('@codemirror/lang-css')).css()];

      if (cancelled) {
        return;
      }

      setResources({
        CodeMirror,
        extensions,
        theme: themeModule.oneDark,
      });
    };

    setResources(null);
    void loadEditor();

    return () => {
      cancelled = true;
    };
  }, [activeEditor]);

  if (!resources) {
    return <div className="px-4 py-6 text-sm text-gray-300">Loading editor…</div>;
  }

  const { CodeMirror, extensions, theme } = resources;

  if (activeEditor === 'html') {
    return (
      <CodeMirror
        value={htmlContent}
        height="300px"
        extensions={extensions}
        theme={theme}
        onChange={onHtmlChange}
        basicSetup={htmlSetup}
      />
    );
  }

  return (
    <CodeMirror
      value={cssContent}
      height="300px"
      extensions={extensions}
      theme={theme}
      onChange={onCssChange}
      basicSetup={cssSetup}
    />
  );
}
