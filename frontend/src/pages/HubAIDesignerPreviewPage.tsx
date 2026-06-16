import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hubAIDesignerService, type DesignVersion } from '../services/hubAIDesignerService';
import { useAuth } from '../contexts/AuthContext';
import { useHubModerators } from '../hooks/useHubModerators';
import { isUserHubModerator } from '../utils/moderation';
import HubAIDesignRenderer from '../components/hubDesign/HubAIDesignRenderer';
import { splitAIDesignHTML } from '../utils/splitAIDesignHTML';

const HubAIDesignCodeEditor = lazy(() => import('../components/hubDesign/HubAIDesignCodeEditor'));

export default function HubAIDesignerPreviewPage() {
  const { hubName, designId } = useParams<{ hubName: string; designId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const numericDesignId = parseInt(designId ?? '0', 10);

  const [htmlContent, setHtmlContent] = useState('');
  const [cssContent, setCssContent] = useState('');
  const [savedHtml, setSavedHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [editorOpen, setEditorOpen] = useState(true);
  const [activeEditor, setActiveEditor] = useState<'html' | 'css'>('html');
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the design
  const { data: designData, isLoading: designLoading } = useQuery({
    queryKey: ['aiDesign', hubName, numericDesignId],
    queryFn: () => hubAIDesignerService.getDesign(hubName!, numericDesignId),
    enabled: !!hubName && !!numericDesignId,
  });

  // Moderator check for slot rendering
  const { moderators: hubModerators } = useHubModerators(hubName);
  const isModerator = useMemo(
    () => isUserHubModerator(user, hubModerators, null),
    [user, hubModerators]
  );

  // Fetch version history
  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ['aiDesignVersions', hubName, numericDesignId],
    queryFn: () => hubAIDesignerService.getVersions(hubName!, numericDesignId),
    enabled: !!hubName && !!numericDesignId,
  });

  // Combines HTML body and CSS into a single design string for backend/preview
  const buildCombinedHtml = useCallback(
    (htmlBody: string, cssStr: string) =>
      cssStr.trim() ? `<style>${cssStr}</style>\n${htmlBody}` : htmlBody,
    []
  );

  // Init state once design loads — split style block from HTML body
  useEffect(() => {
    if (designData?.design?.html_content) {
      const { htmlWithoutStyles, styleContent } = splitAIDesignHTML(designData.design.html_content);
      setHtmlContent(htmlWithoutStyles);
      setCssContent(styleContent);
      setSavedHtml(designData.design.html_content);
      setPreviewHtml(designData.design.html_content);
    }
  }, [designData]);

  // Debounced preview update — rebuild combined HTML from both states
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setPreviewHtml(buildCombinedHtml(htmlContent, cssContent)),
      400
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [htmlContent, cssContent, buildCombinedHtml]);

  const saveMutation = useMutation({
    mutationFn: () =>
      hubAIDesignerService.saveVersion(
        hubName!,
        numericDesignId,
        buildCombinedHtml(htmlContent, cssContent)
      ),
    onSuccess: (data) => {
      setSavedHtml(data.html_content);
      setSaveError(null);
      refetchVersions();
      queryClient.invalidateQueries({ queryKey: ['aiDesign', hubName, numericDesignId] });
    },
    onError: () => setSaveError('Failed to save. Please try again.'),
  });

  const activateMutation = useMutation({
    mutationFn: () => hubAIDesignerService.activateDesign(hubName!, numericDesignId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] }),
        queryClient.invalidateQueries({ queryKey: ['hubAIActiveDesign', hubName] }),
        queryClient.invalidateQueries({ queryKey: ['aiDesign', hubName, numericDesignId] }),
        queryClient.invalidateQueries({ queryKey: ['aiDesignVersions', hubName, numericDesignId] }),
      ]);
      navigate(`/h/${hubName}/settings?tab=ai-designer`);
    },
  });

  const handleCancel = useCallback(() => {
    const { htmlWithoutStyles, styleContent } = splitAIDesignHTML(savedHtml);
    setHtmlContent(htmlWithoutStyles);
    setCssContent(styleContent);
  }, [savedHtml]);

  const handleRestoreVersion = useCallback((version: DesignVersion) => {
    const { htmlWithoutStyles, styleContent } = splitAIDesignHTML(version.html_content);
    setHtmlContent(htmlWithoutStyles);
    setCssContent(styleContent);
    setVersionPanelOpen(false);
  }, []);

  const handleChat = useCallback(async () => {
    if (!chatMessage.trim() || chatLoading) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const result = await hubAIDesignerService.chatRefine(
        hubName!,
        numericDesignId,
        buildCombinedHtml(htmlContent, cssContent),
        chatMessage.trim()
      );
      const { htmlWithoutStyles, styleContent } = splitAIDesignHTML(result.html_content);
      setHtmlContent(htmlWithoutStyles);
      setCssContent(styleContent);
      setChatMessage('');
    } catch (err) {
      setChatError(
        err instanceof Error && err.message
          ? err.message
          : 'AI design refinement could not be completed. Please try again.'
      );
    } finally {
      setChatLoading(false);
    }
  }, [
    chatMessage,
    chatLoading,
    hubName,
    numericDesignId,
    htmlContent,
    cssContent,
    buildCombinedHtml,
  ]);

  const isDirty = buildCombinedHtml(htmlContent, cssContent) !== savedHtml;

  if (designLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-background)]">
        <p className="text-[var(--color-text-secondary)]">Loading design...</p>
      </div>
    );
  }

  if (!designData?.design) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-background)]">
        <p className="text-[var(--color-text-secondary)]">Design not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-background)]">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-sm">
        <button
          onClick={() => navigate(`/h/${hubName}/settings?tab=ai-designer`)}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          ← Back to Settings
        </button>

        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {designData.design.name}
          {isDirty && (
            <span className="ml-2 text-xs font-normal text-amber-500">Unsaved changes</span>
          )}
        </span>

        <button
          onClick={() => activateMutation.mutate()}
          disabled={activateMutation.isPending}
          className="px-4 py-1.5 text-sm font-semibold bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
        >
          {activateMutation.isPending ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {/* AI Chat panel */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          onClick={() => setChatOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-background)] transition-colors"
        >
          <span>✨ AI Chat — ask the AI to refine this design</span>
          <span>{chatOpen ? '▲' : '▼'}</span>
        </button>
        {chatOpen && (
          <div className="px-4 pb-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                placeholder='e.g. "Make the hero darker" or "Add a welcome banner at the top"'
                disabled={chatLoading}
                className="flex-1 px-3 py-2 text-sm rounded border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
              />
              <button
                onClick={handleChat}
                disabled={!chatMessage.trim() || chatLoading}
                className="px-4 py-2 text-sm font-semibold bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary-dark)] disabled:opacity-50 transition-colors"
              >
                {chatLoading ? 'Thinking…' : 'Send'}
              </button>
            </div>
            {chatError && <p className="text-xs text-red-500">{chatError}</p>}
            {chatLoading && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                AI is refining the design — this may take up to 60 seconds…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Preview area — uses the same renderer as the live hub page */}
      <div className="flex-1 overflow-auto">
        {previewHtml && (
          <HubAIDesignRenderer
            key={numericDesignId}
            hubName={hubName!}
            htmlContent={previewHtml}
            user={user}
            isModerator={isModerator}
          />
        )}
      </div>

      {/* IDE panel */}
      <div className="sticky bottom-0 z-50 border-t border-[var(--color-border)] bg-[#282c34]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#21252b]">
          <button
            onClick={() => setEditorOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <span>{'</>'} Editor</span>
            <span className="text-xs">{editorOpen ? '▼' : '▲'}</span>
          </button>
          <div className="flex rounded overflow-hidden border border-gray-600">
            <button
              onClick={() => setActiveEditor('html')}
              className={`px-3 py-1 text-xs transition-colors ${activeEditor === 'html' ? 'bg-[var(--color-primary)] text-white' : 'text-gray-300 hover:text-white'}`}
            >
              HTML
            </button>
            <button
              onClick={() => setActiveEditor('css')}
              className={`px-3 py-1 text-xs transition-colors ${activeEditor === 'css' ? 'bg-[var(--color-primary)] text-white' : 'text-gray-300 hover:text-white'}`}
            >
              CSS
            </button>
          </div>

          <div className="flex items-center gap-2">
            {versionsData?.versions && versionsData.versions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setVersionPanelOpen((o) => !o)}
                  className="px-3 py-1 text-xs text-gray-300 hover:text-white border border-gray-600 rounded transition-colors"
                >
                  History ({versionsData.versions.length})
                </button>
                {versionPanelOpen && (
                  <div className="absolute bottom-full right-0 mb-1 w-64 bg-[#21252b] border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto z-50">
                    {versionsData.versions.map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => handleRestoreVersion(v)}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2c313a] transition-colors border-b border-gray-700 last:border-0"
                      >
                        <span className="font-semibold">v{versionsData.versions.length - i}</span>
                        <span className="ml-2 text-gray-500">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCancel}
              disabled={!isDirty}
              className="px-3 py-1 text-xs text-gray-300 hover:text-white border border-gray-600 rounded disabled:opacity-30 transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || saveMutation.isPending}
              className="px-3 py-1 text-xs font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded disabled:opacity-40 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {saveError && <p className="px-4 py-1 text-xs text-red-400 bg-[#21252b]">{saveError}</p>}

        {editorOpen && (
          <Suspense
            fallback={<div className="px-4 py-6 text-sm text-gray-300">Loading editor…</div>}
          >
            <HubAIDesignCodeEditor
              activeEditor={activeEditor}
              htmlContent={htmlContent}
              cssContent={cssContent}
              onHtmlChange={setHtmlContent}
              onCssChange={setCssContent}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
