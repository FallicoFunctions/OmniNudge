import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mocks ---
const { mockCreateHub } = vi.hoisted(() => ({ mockCreateHub: vi.fn() }));
vi.mock('../../services/hubsService', () => ({
  hubsService: {
    createHub: mockCreateHub,
  },
}));

// --- Component mocks ---
vi.mock('../../components/common/MarkdownInput', () => ({
  MarkdownInput: ({ onChange }: { onChange: (v: string) => void }) => (
    <textarea
      data-testid="markdown-input"
      placeholder="Description"
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('../../components/common/ErrorStates', () => ({
  FieldError: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="field-error">{children}</span>
  ),
  FormError: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="form-error">{children}</span>
  ),
}));
vi.mock('../../components/forms/FormField', () => ({
  FormField: ({
    children,
    label,
    error,
  }: {
    children: React.ReactNode;
    label: string;
    error?: string;
  }) => (
    <div>
      <label>{label}</label>
      {children}
      {error && <span data-testid="field-error">{error}</span>}
    </div>
  ),
}));

import CreateHubPage from '../CreateHubPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

describe('CreateHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders hub creation form', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateHubPage />
      </Wrapper>
    );
    expect(screen.getByText(/create a hub/i)).toBeInTheDocument();
  });

  it('name field is present', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateHubPage />
      </Wrapper>
    );
    // Placeholder is "e.g., books or bookclub" from i18n — use getAllByPlaceholderText
    const nameInputs = screen.getAllByPlaceholderText(/books/i);
    expect(nameInputs.length).toBeGreaterThan(0);
  });

  it('shows validation error when name is too short', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateHubPage />
      </Wrapper>
    );
    const nameInputs = screen.getAllByPlaceholderText(/books/i);
    const nameInput = nameInputs[0];
    fireEvent.change(nameInput, { target: { value: 'ab' } });
    fireEvent.blur(nameInput);

    // Trigger validation by submitting
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('field-error')).toBeInTheDocument();
    });
  });

  it('calls createHub API on valid submission', async () => {
    mockCreateHub.mockResolvedValue({ id: 1, name: 'myhub' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateHubPage />
      </Wrapper>
    );
    const nameInputs = screen.getAllByPlaceholderText(/books/i);
    const nameInput = nameInputs[0];
    fireEvent.change(nameInput, { target: { value: 'myhub' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(mockCreateHub).toHaveBeenCalledWith(expect.objectContaining({ name: 'myhub' }));
    });
  });

  it('public / private radio options are present', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreateHubPage />
      </Wrapper>
    );
    expect(screen.getByText(/public/i)).toBeInTheDocument();
    expect(screen.getByText(/private/i)).toBeInTheDocument();
  });
});
