import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import HubAIDesignerTab from '../HubAIDesignerTab';
import { hubAIDesignerService } from '../../../services/hubAIDesignerService';

vi.mock('../../../services/hubAIDesignerService', () => ({
  hubAIDesignerService: {
    generateDesign: vi.fn(),
    listDesigns: vi.fn(),
    activateDesign: vi.fn(),
    deactivateDesign: vi.fn(),
    deleteDesign: vi.fn(),
    copyDesign: vi.fn(),
  },
}));

vi.mock('../../common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const renderDesignerTab = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HubAIDesignerTab hubName="underreportednews" />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('HubAIDesignerTab', () => {
  const validationMessage =
    'The AI returned a design that did not meet system rules. Please try again.';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hubAIDesignerService.listDesigns).mockResolvedValue({ designs: [] });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('shows mapped generate validation messages', async () => {
    vi.mocked(hubAIDesignerService.generateDesign).mockRejectedValue(new Error(validationMessage));

    renderDesignerTab();
    fireEvent.change(screen.getByLabelText('Describe your Hub page'), {
      target: { value: 'newspaper landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    expect(await screen.findByText(validationMessage)).toBeInTheDocument();
    expect(screen.queryByText(/ordinary CSS selectors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your connection/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 502/i)).not.toBeInTheDocument();
  });

  it('shows mapped generate timeout messages', async () => {
    vi.mocked(hubAIDesignerService.generateDesign).mockRejectedValue(
      new Error('AI design generation timed out. Please try again.')
    );

    renderDesignerTab();
    fireEvent.change(screen.getByLabelText('Describe your Hub page'), {
      target: { value: 'newspaper landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    expect(
      await screen.findByText('AI design generation timed out. Please try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/check your connection/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 502/i)).not.toBeInTheDocument();
  });

  it('shows a fallback message for generic generate failures', async () => {
    vi.mocked(hubAIDesignerService.generateDesign).mockRejectedValue(new Error());

    renderDesignerTab();
    fireEvent.change(screen.getByLabelText('Describe your Hub page'), {
      target: { value: 'newspaper landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    expect(await screen.findByText('Generation failed. Please try again.')).toBeInTheDocument();
  });

  it('renders preview after successful generation', async () => {
    vi.mocked(hubAIDesignerService.generateDesign).mockResolvedValue({
      id: 42,
      name: 'Design #1',
      html_content: '<div class="hub-custom-page"></div>',
      prompt: 'newspaper landing page',
      message: 'Design generated. Use the activate endpoint to publish it.',
    });

    renderDesignerTab();
    fireEvent.change(screen.getByLabelText('Describe your Hub page'), {
      target: { value: 'newspaper landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Design' }));

    await waitFor(() => {
      expect(screen.getByText('Design #1')).toBeInTheDocument();
    });
    expect(screen.getByTitle('AI Hub Design Preview')).toHaveAttribute('src', 'blob:preview');
  });
});
