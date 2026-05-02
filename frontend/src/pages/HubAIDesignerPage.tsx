import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';
import { hubAIDesignerService, type AIDesign } from '../services/hubAIDesignerService';
import { hubSettingsService } from '../services/hubSettingsService';
import { useAuth } from '../contexts/AuthContext';
import { PermissionDenied } from '../components/empty';
import { LoadingMessage } from '../components/common/StatusMessage';
import { isAdmin } from '../utils/permissions';

const MAX_PROMPT_LENGTH = 500;
const MAX_NAME_LENGTH = 100;

export default function HubAIDesignerPage() {
  const { hubName } = useParams<{ hubName: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState('');
  const [previewHTML, setPreviewHTML] = useState<string | null>(null);
  const [pendingDesignId, setPendingDesignId] = useState<number | null>(null);
  const [pendingDesignName, setPendingDesignName] = useState('');
  const [editorHTML, setEditorHTML] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: moderatorsData, isLoading: modLoading } = useQuery({
    queryKey: ['hubModerators', hubName],
    queryFn: () => hubSettingsService.getHubModerators(hubName!),
    enabled: !!hubName,
  });

  const { data: designsData, isLoading: designsLoading } = useQuery({
    queryKey: ['hubAIDesigns', hubName],
    queryFn: () => hubAIDesignerService.listDesigns(hubName!),
    enabled: !!hubName && !!user,
  });

  const isMod =
    isAdmin(user?.role) ||
    moderatorsData?.moderators?.some(
      (m) => m.user_id === user?.id && (m.role === 'owner' || m.role === 'full_moderator')
    );

  const loadDesign = (design: AIDesign) => {
    setPreviewHTML(design.html_content);
    setPendingDesignId(design.id);
    setPendingDesignName(design.name);
    setEditorHTML(design.html_content);
    setPrompt(design.prompt);
    setSaveSuccess(false);
  };

  // When navigated here with ?editId=<id>, load that design once data arrives.
  useEffect(() => {
    const editId = searchParams.get('editId');
    if (!editId || !designsData?.designs || previewHTML) return;
    const design = designsData.designs.find((d) => d.id === Number(editId));
    if (design) loadDesign(design);
  }, [searchParams, designsData]);

  const generateMutation = useMutation({
    mutationFn: () => hubAIDesignerService.generateDesign(hubName!, prompt),
    onSuccess: (data) => {
      setPreviewHTML(data.html_content);
      setPendingDesignId(data.id);
      setPendingDesignName(data.name);
      setEditorHTML(data.html_content);
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Generation failed. Please try again.');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.activateDesign(hubName!, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubAIActiveDesign', hubName] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => hubAIDesignerService.deactivateDesign(hubName!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubAIActiveDesign', hubName] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.deleteDesign(hubName!, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
  });

  const copyMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.copyDesign(hubName!, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      hubAIDesignerService.updateDesign(hubName!, pendingDesignId!, {
        name: pendingDesignName,
        html_content: editorHTML,
      }),
    onSuccess: (data) => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setEditorHTML(data.html_content);
      setPreviewHTML(data.html_content);
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
  });

  if (modLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingMessage>Loading...</LoadingMessage>
      </div>
    );
  }

  if (!isMod) {
    return <PermissionDenied />;
  }

  const activeDesign = designsData?.designs?.find((d) => d.is_active);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <Link
        to={`/h/${hubName}/settings`}
        className="inline-block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
      >
        ← Hub Settings
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">AI Hub Page Designer</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Describe your ideal Hub page and AI will generate the HTML layout for you. Designs
          are rendered in a secure sandbox — no scripts can run.
        </p>
      </div>

      {/* AI prompt */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
        <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
          Describe your Hub page
        </label>
        <textarea
          className="w-full h-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder='e.g. "Dark-themed page for a Retro Gaming community with a hero banner, a grid of top posts, and a neon green accent sidebar."'
          maxLength={MAX_PROMPT_LENGTH}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={!prompt.trim() || generateMutation.isPending}
            className="px-5 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate Design'}
          </button>
        </div>
        {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
      </div>

      {/* Preview */}
      {previewHTML && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Preview</h2>
              {pendingDesignName && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{pendingDesignName}</p>
              )}
            </div>
            {pendingDesignId && (
              <button
                onClick={() => activateMutation.mutate(pendingDesignId)}
                disabled={activateMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {activateMutation.isPending ? 'Publishing…' : 'Publish This Design'}
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Rendered in a secure sandbox. Scripts are blocked.</p>
          <iframe
            className="w-full rounded-lg border border-[var(--color-border)] bg-white"
            style={{ minHeight: 480 }}
            sandbox="allow-same-origin"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-white p-4">${previewHTML}</body></html>`}
            title="AI Hub Design Preview"
          />
        </div>
      )}

      {/* HTML editor — shown below preview when a design is loaded */}
      {pendingDesignId && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">HTML Editor</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Changes update the preview above in real time.</p>
            </div>
            <div className="flex items-center gap-3">
              {saveSuccess && (
                <span className="text-sm text-green-500 font-medium">Saved</span>
              )}
              <div className="space-y-1 flex-shrink-0">
                <label className="block text-xs text-[var(--color-text-muted)]">Design name</label>
                <input
                  type="text"
                  maxLength={MAX_NAME_LENGTH}
                  value={pendingDesignName}
                  onChange={(e) => setPendingDesignName(e.target.value)}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!pendingDesignName.trim() || updateMutation.isPending}
                className="mt-5 px-5 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
          <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
            <CodeMirror
              value={editorHTML}
              height="400px"
              theme={oneDark}
              extensions={[html()]}
              onChange={(value) => {
                setEditorHTML(value);
                setPreviewHTML(value);
              }}
            />
          </div>
          {updateMutation.isError && (
            <p className="text-sm text-red-500">Save failed. Please try again.</p>
          )}
        </div>
      )}

      {/* Active design banner */}
      {activeDesign && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {activeDesign.name}
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs bg-green-600 text-white">Live</span>
            </h2>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              {deactivateMutation.isPending ? 'Removing…' : 'Remove Active Design'}
            </button>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] italic">"{activeDesign.prompt}"</p>
        </div>
      )}

      {/* Saved designs list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Saved Designs</h2>
        {designsLoading ? (
          <LoadingMessage>Loading designs…</LoadingMessage>
        ) : !designsData?.designs?.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No saved designs yet. Generate one above.</p>
        ) : (
          <ul className="space-y-3">
            {designsData.designs.map((design: AIDesign) => (
              <li
                key={design.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                    {design.name}
                    {design.is_active && (
                      <span className="inline-block px-1.5 py-0.5 rounded-full text-xs bg-green-600 text-white">Active</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-1 italic">
                    "{design.prompt}"
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {new Date(design.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                  <button
                    onClick={() => loadDesign(design)}
                    className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] font-medium transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => copyMutation.mutate(design.id)}
                    disabled={copyMutation.isPending}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] font-medium transition-colors"
                  >
                    Copy
                  </button>
                  {!design.is_active && (
                    <button
                      onClick={() => activateMutation.mutate(design.id)}
                      disabled={activateMutation.isPending}
                      className="text-xs text-green-600 hover:text-green-700 font-medium transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(design.id)}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
