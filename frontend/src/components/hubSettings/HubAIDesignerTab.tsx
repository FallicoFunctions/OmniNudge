import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hubAIDesignerService, type AIDesign } from '../../services/hubAIDesignerService';
import { LoadingMessage } from '../common/StatusMessage';

const MAX_PROMPT_LENGTH = 500;

interface Props {
  hubName: string;
}

export default function HubAIDesignerTab({ hubName }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState('');
  const [previewHTML, setPreviewHTML] = useState<string | null>(null);
  const [pendingDesignId, setPendingDesignId] = useState<number | null>(null);
  const [pendingDesignName, setPendingDesignName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    if (!previewHTML) { setPreviewBlobUrl(null); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script></head><body class="bg-white p-4">${previewHTML}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setPreviewBlobUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [previewHTML]);

  const { data: designsData, isLoading: designsLoading } = useQuery({
    queryKey: ['hubAIDesigns', hubName],
    queryFn: () => hubAIDesignerService.listDesigns(hubName),
  });

  const generateMutation = useMutation({
    mutationFn: () => hubAIDesignerService.generateDesign(hubName, prompt),
    onSuccess: (data) => {
      setPreviewHTML(data.html_content);
      setPendingDesignId(data.id);
      setPendingDesignName(data.name);
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Generation failed. Please try again.');
    },
  });

  const activateMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.activateDesign(hubName, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubAIActiveDesign', hubName] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => hubAIDesignerService.deactivateDesign(hubName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubAIActiveDesign', hubName] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.deleteDesign(hubName, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
  });

  const copyMutation = useMutation({
    mutationFn: (designId: number) => hubAIDesignerService.copyDesign(hubName, designId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubAIDesigns', hubName] });
    },
  });

  const activeDesign = designsData?.designs?.find((d) => d.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">AI Hub Page Designer</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Describe your ideal Hub page and AI will generate the HTML layout for you.
          Designs are previewed in a sandboxed iframe and cannot access your account.
        </p>
      </div>

      {/* Prompt form */}
      <div className="border border-[var(--color-border)] rounded p-4 space-y-4">
        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
          Describe your Hub page
        </label>
        <textarea
          aria-label="Describe your Hub page"
          className="w-full h-32 px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm"
          placeholder='e.g. "Dark-themed page for a Retro Gaming community with a hero banner, a grid of top posts, and a neon green accent sidebar."'
          maxLength={MAX_PROMPT_LENGTH}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={!prompt.trim() || generateMutation.isPending}
            className="px-4 py-2 rounded bg-[var(--color-primary)] text-white text-sm hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate Design'}
          </button>
        </div>
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </div>

      {/* Preview of just-generated design */}
      {previewHTML && (
        <div className="border border-[var(--color-border)] rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-[var(--color-text-primary)]">Preview</h3>
              {pendingDesignName && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{pendingDesignName}</p>
              )}
            </div>
            <div className="flex gap-2">
              {pendingDesignId && (
                <>
                  <button
                    onClick={() => navigate(`/h/${hubName}/ai-design/preview/${pendingDesignId}`)}
                    className="px-3 py-1 text-sm rounded border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-background)] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => activateMutation.mutate(pendingDesignId)}
                    disabled={activateMutation.isPending}
                    className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {activateMutation.isPending ? 'Publishing…' : 'Publish'}
                  </button>
                  <button
                    onClick={() => { setPreviewHTML(null); setPendingDesignId(null); setPendingDesignName(''); }}
                    className="px-3 py-1 text-sm rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
          <iframe
            className="w-full rounded border border-[var(--color-border)] bg-white"
            style={{ minHeight: 400 }}
            src={previewBlobUrl ?? undefined}
            sandbox="allow-scripts allow-same-origin"
            title="AI Hub Design Preview"
          />
        </div>
      )}

      {/* Active design banner */}
      {activeDesign && (
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-green-900">
                {activeDesign.name}
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-green-600 text-white">Live</span>
              </h3>
              <p className="text-sm text-green-800 italic mt-0.5">"{activeDesign.prompt}"</p>
            </div>
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              {deactivateMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {/* Saved designs list */}
      <div className="border border-[var(--color-border)] rounded overflow-hidden">
        <div className="bg-[var(--color-background)] px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="font-medium text-[var(--color-text-primary)]">Saved Designs</h3>
        </div>
        {designsLoading ? (
          <div className="p-4">
            <LoadingMessage>Loading designs…</LoadingMessage>
          </div>
        ) : !designsData?.designs?.length ? (
          <p className="p-4 text-sm text-[var(--color-text-secondary)]">
            No saved designs yet. Generate one above.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {designsData.designs.map((design: AIDesign) => (
              <div key={design.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-text-primary)] text-sm">
                      {design.name}
                    </span>
                    {design.is_active && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] italic line-clamp-1 mt-0.5">
                    "{design.prompt}"
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    {new Date(design.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => navigate(`/h/${hubName}/ai-design/preview/${design.id}`)}
                    className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-strong)] font-medium transition-colors"
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
                    className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
