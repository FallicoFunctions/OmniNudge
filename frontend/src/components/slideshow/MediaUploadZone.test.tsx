import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('accepts supported file when browser MIME is empty but extension is known', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(<MediaUploadZone onFilesSelected={onFilesSelected} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const noMimeDoc = new File(['pdf-bytes'], 'scan.pdf', { type: '' });
    fireEvent.change(input, { target: { files: [noMimeDoc] } });

    expect(screen.queryByText('scan.pdf: Unsupported file type')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(onFilesSelected).toHaveBeenCalledWith([noMimeDoc]);
  });
});

describe('MediaUploadZone preview object URLs', () => {
  let created: string[];
  let revoked: string[];

  beforeEach(() => {
    created = [];
    revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:preview-${created.length}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(String(url));
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const image = (name: string, type = 'image/png') => new File(['bytes'], name, { type });

  const select = (files: File[]) => {
    const rendered = render(<MediaUploadZone onFilesSelected={vi.fn()} />);
    const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });
    return rendered;
  };

  it('creates one object URL per image and keeps it across re-renders', () => {
    const { container } = select([image('first.png')]);
    expect(created).toEqual(['blob:preview-0']);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [image('second.png')] } });

    expect(created).toEqual(['blob:preview-0', 'blob:preview-1']);
    expect(screen.getByAltText('first.png')).toHaveAttribute('src', 'blob:preview-0');
    expect(screen.getByAltText('second.png')).toHaveAttribute('src', 'blob:preview-1');
  });

  it('previews an image whose browser MIME is empty but extension is known', () => {
    select([image('photo.jpg', ''), image('scan.pdf', 'application/pdf')]);

    expect(screen.getByAltText('photo.jpg')).toHaveAttribute('src', 'blob:preview-0');
    expect(screen.queryByAltText('scan.pdf')).not.toBeInTheDocument();
    expect(created).toEqual(['blob:preview-0']);
  });

  it('revokes the object URL when the file is removed', () => {
    select([image('first.png'), image('second.png')]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove file' })[0]);

    expect(screen.queryByAltText('first.png')).not.toBeInTheDocument();
    expect(revoked).toEqual(['blob:preview-0']);
  });

  it('revokes every remaining object URL on unmount', () => {
    const { unmount } = select([image('first.png'), image('second.png')]);

    unmount();

    expect(revoked.sort()).toEqual(['blob:preview-0', 'blob:preview-1']);
  });

  it('revokes each URL exactly once when upload is followed by unmount', () => {
    // MessagesPage.handleMultiFileUpload hides the zone inside the callback, so the
    // parent unmount lands in the same batch as this component's own reset. The
    // cleanup must release what it still owns, not whatever state it last mirrored.
    const { unmount } = select([image('first.png'), image('second.png')]);

    fireEvent.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    unmount();

    expect(revoked).toEqual(['blob:preview-0', 'blob:preview-1']);
  });

  it('revokes every object URL when the selection is cleared', () => {
    select([image('first.png')]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(screen.queryByAltText('first.png')).not.toBeInTheDocument();
    expect(revoked).toEqual(['blob:preview-0']);
  });
});
