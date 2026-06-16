import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PDFViewerModal from './PDFViewerModal';

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    pdfjs: {
      GlobalWorkerOptions: {
        workerSrc: '',
      },
    },
    Document: ({
      children,
      file,
      onLoadSuccess,
      onLoadError,
      loading,
    }: {
      children: React.ReactNode;
      file?: string;
      onLoadSuccess?: (payload: { numPages: number }) => void;
      onLoadError?: (error: Error) => void;
      loading?: React.ReactNode;
    }) => {
      const initialized = React.useRef(false);
      React.useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        if (file?.includes('fail')) {
          onLoadError?.(new Error('load failed'));
          return;
        }
        onLoadSuccess?.({ numPages: 5 });
      }, [file, onLoadError, onLoadSuccess]);

      if (!file) {
        return <>{loading}</>;
      }
      return <div data-testid="pdf-doc">{children}</div>;
    },
    Page: ({ pageNumber, scale }: { pageNumber: number; scale: number }) => (
      <div data-testid="pdf-page">
        page={pageNumber};scale={scale}
      </div>
    ),
  };
});

describe('PDFViewerModal', () => {
  it('renders and supports pagination/zoom/download', async () => {
    const onClose = vi.fn();
    render(
      <PDFViewerModal isOpen pdfUrl="/uploads/guide.pdf" fileName="guide.pdf" onClose={onClose} />
    );

    await waitFor(() => {
      expect(screen.getAllByText('Page 1 of 5')).toHaveLength(2);
    });
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('page=1;scale=1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page 2 of 5')).toHaveLength(2);
    });
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('page=2;scale=1');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page')).toHaveTextContent('page=2;scale=1.25');

    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'guide.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows load error state when document fails to load', async () => {
    render(
      <PDFViewerModal isOpen pdfUrl="/uploads/fail.pdf" fileName="fail.pdf" onClose={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to load PDF.')).toBeInTheDocument();
    });
  });
});
