import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { hubSettingsService } from '../services/hubSettingsService';

interface ThemePreviewState {
  scopedCSS: string;
  rawCSS: string;
  themeName: string;
  applyToWholePage: boolean;
  applyToHeader: boolean;
  applyToSidebar: boolean;
  applyToPostList: boolean;
  applyToPostDetail: boolean;
}

export default function HubThemePreviewPage() {
  const { hubName } = useParams<{ hubName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ThemePreviewState | null;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cssContent, setCssContent] = useState(state?.rawCSS ?? '');
  const [editorOpen, setEditorOpen] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Redirect if navigated to directly without state
  useEffect(() => {
    if (!state) navigate(`/h/${hubName}/settings?tab=theme`, { replace: true });
  }, []);

  const injectCSS = useCallback((content: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    let el = doc.getElementById('theme-preview-css') as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = 'theme-preview-css';
      doc.head.appendChild(el);
    }
    el.textContent = content;
  }, []);

  // Debounced re-injection on CSS edits
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => injectCSS(cssContent), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cssContent, injectCSS]);

  const activateMutation = useMutation({
    mutationFn: () => hubSettingsService.createTheme(hubName!, {
      name: state!.themeName,
      is_active: true,
      css_content: cssContent,
      apply_to_whole_page: state!.applyToWholePage,
      apply_to_header: state!.applyToHeader,
      apply_to_sidebar: state!.applyToSidebar,
      apply_to_post_list: state!.applyToPostList,
      apply_to_post_detail: state!.applyToPostDetail,
    }),
    onSuccess: () => navigate(`/h/${hubName}/settings?tab=theme`),
    onError: () => setSaveError('Failed to activate theme. Please try again.'),
  });

  // All hooks declared above — safe to return null now
  if (!state) return null;

  return (
    <div className="flex flex-col h-screen bg-[var(--color-background)]">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-sm">
        <button
          onClick={() => navigate(`/h/${hubName}/settings?tab=theme`)}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          ← Back to Settings
        </button>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {state.themeName}
        </span>
        <button
          onClick={() => activateMutation.mutate()}
          disabled={activateMutation.isPending}
          className="px-4 py-1.5 text-sm font-semibold bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
        >
          {activateMutation.isPending ? 'Activating…' : 'Activate'}
        </button>
      </div>

      {/* Live hub page preview */}
      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={`/h/${hubName}`}
          className="w-full h-full border-0"
          title="Theme Preview"
          onLoad={() => injectCSS(cssContent)}
        />
      </div>

      {/* CSS editor panel */}
      <div className="sticky bottom-0 z-50 border-t border-[var(--color-border)] bg-[#282c34]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#21252b]">
          <button
            onClick={() => setEditorOpen(o => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <span>{'</>'} CSS Editor</span>
            <span className="text-xs">{editorOpen ? '▼' : '▲'}</span>
          </button>
        </div>
        {saveError && (
          <p className="px-4 py-1 text-xs text-red-400 bg-[#21252b]">{saveError}</p>
        )}
        {editorOpen && (
          <CodeMirror
            value={cssContent}
            height="250px"
            extensions={[css()]}
            theme={oneDark}
            onChange={val => setCssContent(val)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              syntaxHighlighting: true,
              bracketMatching: true,
              autocompletion: true,
              highlightActiveLine: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
