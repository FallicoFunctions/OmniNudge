import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MediaUploadZone } from './MediaUploadZone';

describe('MediaUploadZone', () => {
  it('includes expanded accepted file types', () => {
    const { container } = render(<MediaUploadZone onFilesSelected={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('application/pdf');
    expect(input.accept).toContain('application/msword');
    expect(input.accept).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(input.accept).toContain('text/plain');
    expect(input.accept).toContain('audio/mpeg');
    expect(input.accept).toContain('audio/mp4');
    expect(input.accept).toContain('audio/opus');
    expect(input.accept).toContain('video/x-matroska');
    expect(input.accept).toContain('application/zip');
    expect(input.accept).toContain('application/x-zip-compressed');
  });

  it('accepts supported files and rejects unsupported files', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(<MediaUploadZone onFilesSelected={onFilesSelected} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdf = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
    const exe = new File(['bad'], 'malware.exe', { type: 'application/x-msdownload' });

    fireEvent.change(input, { target: { files: [pdf, exe] } });
    expect(screen.getByText('malware.exe: Unsupported file type')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(onFilesSelected).toHaveBeenCalledWith([pdf]);
  });

  it('enforces file-size limits by MIME type', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(<MediaUploadZone onFilesSelected={onFilesSelected} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const oversizedPdf = new File(['pdf'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversizedPdf, 'size', { value: 30 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [oversizedPdf] } });
    expect(screen.getByText('huge.pdf: File size exceeds 25MB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload 1 file' })).not.toBeInTheDocument();

    const midVideo = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    Object.defineProperty(midVideo, 'size', { value: 30 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [midVideo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(onFilesSelected).toHaveBeenCalledWith([midVideo]);
  });
});
