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
});
