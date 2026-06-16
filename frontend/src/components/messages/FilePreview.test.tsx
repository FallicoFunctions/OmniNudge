import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FilePreview, { detectPreviewKind, formatFileSize } from './FilePreview';

describe('FilePreview', () => {
  it('classifies MIME types into preview kinds', () => {
    expect(detectPreviewKind('image/png')).toBe('image');
    expect(detectPreviewKind('video/mp4')).toBe('video');
    expect(detectPreviewKind('audio/mpeg')).toBe('audio');
    expect(detectPreviewKind('application/pdf')).toBe('pdf');
    expect(detectPreviewKind('text/plain')).toBe('text');
    expect(
      detectPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe('document');
    expect(detectPreviewKind('application/octet-stream')).toBe('file');
  });

  it('formats byte sizes for UI display', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('renders PDF preview metadata and open action', () => {
    const onOpen = vi.fn();

    render(
      <FilePreview
        src="/uploads/report.pdf"
        mimeType="application/pdf"
        fileName="report.pdf"
        fileSize={4096}
        onOpen={onOpen}
      />
    );

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('File size: 4.0 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      'report.pdf'
    );
  });

  it('falls back to PDF placeholder when thumbnail image fails to load', () => {
    render(
      <FilePreview
        src="/uploads/report.pdf"
        mimeType="application/pdf"
        fileName="report.pdf"
        fileSize={4096}
        thumbnailUrl="/uploads/report_thumb.jpg"
      />
    );

    const img = screen.getByAltText('PDF thumbnail');
    fireEvent.error(img);
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('resets PDF thumbnail failure state when thumbnail/source props change', () => {
    const { rerender } = render(
      <FilePreview
        src="/uploads/report-a.pdf"
        mimeType="application/pdf"
        fileName="report-a.pdf"
        fileSize={4096}
        thumbnailUrl="/uploads/report-a_thumb.jpg"
      />
    );

    fireEvent.error(screen.getByAltText('PDF thumbnail'));
    expect(screen.getByText('PDF')).toBeInTheDocument();

    rerender(
      <FilePreview
        src="/uploads/report-b.pdf"
        mimeType="application/pdf"
        fileName="report-b.pdf"
        fileSize={4096}
        thumbnailUrl="/uploads/report-b_thumb.jpg"
      />
    );

    expect(screen.getByAltText('PDF thumbnail')).toBeInTheDocument();
  });

  it('renders text preview and truncates at max length', () => {
    const longText = 'a'.repeat(250);
    render(
      <FilePreview
        src="/uploads/notes.txt"
        mimeType="text/plain"
        fileName="notes.txt"
        textPreview={longText}
        maxTextPreviewChars={200}
      />
    );

    const pre = screen.getByText((content) => content.startsWith('aaaaa'));
    expect(pre.textContent?.length).toBe(203);
    expect(pre.textContent?.endsWith('...')).toBe(true);
  });

  it('does not open viewer when clicking video element controls area', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FilePreview
        src="/uploads/clip.mp4"
        mimeType="video/mp4"
        fileName="clip.mp4"
        onOpen={onOpen}
      />
    );

    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    if (!video) throw new Error('video missing');

    fireEvent.click(video);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('opens external file previews with noopener/noreferrer', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <FilePreview
        src="/uploads/file.bin"
        mimeType="application/octet-stream"
        fileName="file.bin"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(openSpy).toHaveBeenCalledWith('/uploads/file.bin', '_blank', 'noopener,noreferrer');
  });
});
