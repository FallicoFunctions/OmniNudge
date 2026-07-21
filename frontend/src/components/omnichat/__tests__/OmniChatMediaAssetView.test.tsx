import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatMediaAssetView from '../OmniChatMediaAssetView';
import { omnichatService } from '../../../services/omnichatService';
import type { OmniChatMediaAsset } from '../../../types/omnichat';

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    getMediaAssetContent: vi.fn(),
  },
}));

const baseAsset: OmniChatMediaAsset = {
  id: '0bf893df-9031-49e3-94d5-71ab5ee875c5',
  owner_user_id: 1,
  persona_id: 2,
  generation_job_id: 'f39a67ae-d924-4ac8-b04b-7616d4996d33',
  kind: 'image',
  visibility: 'private',
  prompt: 'Sadie at the park',
  scene: { location: 'park' },
  file_type: 'image/png',
  content_url: '/api/v1/omnichat/media/id/content',
  created_at: '2026-07-20T12:00:00Z',
};

describe('OmniChatMediaAssetView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:generated-media'),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(omnichatService.getMediaAssetContent).mockResolvedValue(new Blob(['media']));
  });

  it('loads private image bytes with authentication and renders the scene', async () => {
    render(<OmniChatMediaAssetView asset={baseAsset} />);

    expect(screen.getByLabelText('Loading generated image')).toBeInTheDocument();
    const image = await screen.findByRole('img', { name: 'Sadie at the park' });
    expect(image).toHaveAttribute('src', 'blob:generated-media');
    expect(omnichatService.getMediaAssetContent).toHaveBeenCalledWith(
      baseAsset.id,
      baseAsset.content_url
    );
  });

  it('renders generated videos with controls', async () => {
    render(<OmniChatMediaAssetView asset={{ ...baseAsset, kind: 'video' }} />);

    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    expect(document.querySelector('video')).toHaveAttribute('controls');
  });

  it('loads public video with viewer authentication before rendering it', async () => {
    render(
      <OmniChatMediaAssetView
        asset={{
          ...baseAsset,
          kind: 'video',
          file_type: 'video/mp4',
          visibility: 'public',
          content_url: '/api/v1/omnichat/explore/media/id/content',
        }}
      />
    );

    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    expect(document.querySelector('video')).toHaveAttribute('src', 'blob:generated-media');
    expect(omnichatService.getMediaAssetContent).toHaveBeenCalledWith(
      baseAsset.id,
      '/api/v1/omnichat/explore/media/id/content'
    );
  });
});
