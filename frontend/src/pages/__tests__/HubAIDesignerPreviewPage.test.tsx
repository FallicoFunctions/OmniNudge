import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDesign = vi.fn();
const mockGetVersions = vi.fn();
const mockActivateDesign = vi.fn();
const mockSaveVersion = vi.fn();
const mockChatRefine = vi.fn();

vi.mock('../../services/hubAIDesignerService', () => ({
  hubAIDesignerService: {
    getDesign: (...args: unknown[]) => mockGetDesign(...args),
    getVersions: (...args: unknown[]) => mockGetVersions(...args),
    activateDesign: (...args: unknown[]) => mockActivateDesign(...args),
    saveVersion: (...args: unknown[]) => mockSaveVersion(...args),
    chatRefine: (...args: unknown[]) => mockChatRefine(...args),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 42, role: 'user', username: 'previewer' },
    isAuthenticated: true,
  }),
}));

vi.mock('../../hooks/useHubModerators', () => ({
  useHubModerators: () => ({ isLoading: true }),
}));

vi.mock('../../components/hubDesign/HubAIDesignRenderer', () => ({
  default: ({ htmlContent }: { htmlContent: string }) => (
    <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
  ),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}));

vi.mock('@codemirror/lang-html', () => ({
  html: () => ({}),
}));

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}));

import HubAIDesignerPreviewPage from '../HubAIDesignerPreviewPage';

const aiDesignHTML = `
  <div class="hub-custom-page">
    <section>
      <h1>Preview AI Layout</h1>
      <div id="hub-join"></div>
    </section>
    <div id="hub-create"></div>
    <div id="hub-mod"></div>
    <div id="hub-feed"></div>
  </div>
`;

function renderPreviewPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/h/testHub/ai-design/preview/123']}>
        <Routes>
          <Route
            path="/h/:hubName/ai-design/preview/:designId"
            element={<HubAIDesignerPreviewPage />}
          />
          <Route path="/h/:hubName/settings" element={<div>Hub settings</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...renderResult, queryClient };
}

describe('HubAIDesignerPreviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDesign.mockResolvedValue({
      design: {
        id: 123,
        name: 'Preview design',
        prompt: 'preview',
        html_content: aiDesignHTML,
        created_at: '2026-05-10T00:00:00Z',
      },
    });
    mockGetVersions.mockResolvedValue({ versions: [] });
    mockActivateDesign.mockResolvedValue(undefined);
    mockSaveVersion.mockResolvedValue({ html_content: aiDesignHTML });
    mockChatRefine.mockResolvedValue({ html_content: aiDesignHTML });
  });

  it('renders the AI preview while moderator data is unresolved', async () => {
    renderPreviewPage();

    await waitFor(() => {
      expect(screen.getByText('Preview AI Layout')).toBeInTheDocument();
    });
  });

  it('shows mapped refinement errors from the shared service', async () => {
    mockChatRefine.mockRejectedValue(
      new Error('AI design refinement timed out. Please try again.')
    );

    renderPreviewPage();

    await screen.findByText('Preview AI Layout');
    fireEvent.change(screen.getByPlaceholderText(/Make the hero darker/i), {
      target: { value: 'make the hero darker' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('AI design refinement timed out. Please try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI request failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your connection/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
    });
  });

  it('invalidates AI designer caches before returning to settings after publish', async () => {
    const { queryClient } = renderPreviewPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['hubAIDesigns', 'testHub'], { designs: [] });
    queryClient.setQueryData(['hubAIActiveDesign', 'testHub'], { design: null });
    queryClient.setQueryData(['aiDesign', 'testHub', 123], { design: { id: 123 } });
    queryClient.setQueryData(['aiDesignVersions', 'testHub', 123], { versions: [] });

    await screen.findByText('Preview AI Layout');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(mockActivateDesign).toHaveBeenCalledWith('testHub', 123);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hubAIDesigns', 'testHub'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['hubAIActiveDesign', 'testHub'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['aiDesign', 'testHub', 123] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['aiDesignVersions', 'testHub', 123],
      });
    });
  });
});
