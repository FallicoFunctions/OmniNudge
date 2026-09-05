import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatMediaAssetView from '../OmniChatMediaAssetView';
import { omnichatService } from '../../../services/omnichatService';
import type { OmniChatMediaAsset } from '../../../types/omnichat';

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    getMediaAssetContent: vi.fn(),
    getMediaAssetThumbnail: vi.fn(),
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
    vi.mocked(omnichatService.getMediaAssetThumbnail).mockResolvedValue(new Blob(['thumbnail']));
  });

  it('loads private image bytes with authentication and renders the scene', async () => {
    render(<OmniChatMediaAssetView asset={baseAsset} />);

    expect(screen.getByLabelText('Loading generated image')).toBeInTheDocument();
    const image = await screen.findByRole('img', { name: 'Sadie at the park' });
    expect(image).toHaveAttribute('src', 'blob:generated-media');
    expect(image).toHaveClass('object-contain');
    expect(omnichatService.getMediaAssetContent).toHaveBeenCalledWith(
      baseAsset.id,
      baseAsset.content_url
    );
  });

  it('renders generated videos with controls', async () => {
    render(<OmniChatMediaAssetView asset={{ ...baseAsset, kind: 'video' }} />);

    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    expect(document.querySelector('video')).toHaveAttribute('controls');
    expect(document.querySelector('video')).toHaveClass('object-contain');
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
  // A gallery grid must never fetch the clips it lists. One real render was 6.6
  // MB, so a page of twelve tiles holding six clips pulled about forty
  // megabytes before it drew anything, on every visit and whether or not
  // anybody pressed play.
  describe('as a grid tile', () => {
    const clip: OmniChatMediaAsset = {
      ...baseAsset,
      kind: 'video',
      file_type: 'video/mp4',
      thumbnail_url: '/api/v1/omnichat/media/id/thumbnail',
    };

    it('shows the thumbnail and never fetches the asset', async () => {
      render(<OmniChatMediaAssetView asset={clip} preview />);

      const poster = await screen.findByRole('img', { name: 'Sadie at the park' });
      expect(poster).toHaveAttribute('src', 'blob:generated-media');
      expect(omnichatService.getMediaAssetThumbnail).toHaveBeenCalledWith(clip.id, clip.thumbnail_url);
      expect(omnichatService.getMediaAssetContent).not.toHaveBeenCalled();
      expect(document.querySelector('video')).toBeNull();
    });

    // A clip made before posters existed, or one whose poster could not be
    // made. Falling back to the clip would put the whole download back.
    it('shows a placeholder rather than the asset when there is no thumbnail', async () => {
      const { thumbnail_url: _unused, ...withoutPoster } = clip;
      render(<OmniChatMediaAssetView asset={withoutPoster} preview />);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Play generated video' })).toBeInTheDocument()
      );
      expect(omnichatService.getMediaAssetThumbnail).not.toHaveBeenCalled();
      expect(omnichatService.getMediaAssetContent).not.toHaveBeenCalled();
    });

    // The gallery is still the place people watch their clips, so the tile has
    // to be able to become one.
    it('fetches the asset once the viewer asks for it', async () => {
      const user = userEvent.setup();
      render(<OmniChatMediaAssetView asset={clip} preview />);

      await user.click(await screen.findByRole('button', { name: 'Play generated video' }));

      await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
      expect(omnichatService.getMediaAssetContent).toHaveBeenCalledWith(clip.id, clip.content_url);
    });

    // A generated image is about a megabyte of PNG shown in a tile a few
    // hundred pixels wide, so it needs the thumbnail as much as a clip does.
    it('shows an image tile from its thumbnail too', async () => {
      render(
        <OmniChatMediaAssetView
          asset={{ ...baseAsset, thumbnail_url: '/api/v1/omnichat/media/id/thumbnail' }}
          preview
        />
      );

      await screen.findByRole('img', { name: 'Sadie at the park' });
      expect(omnichatService.getMediaAssetThumbnail).toHaveBeenCalled();
      expect(omnichatService.getMediaAssetContent).not.toHaveBeenCalled();
    });
  });

  // Outside a grid nothing changed: the asset itself is the point of the view.
  it('loads the asset directly when it is not a tile', async () => {
    render(
      <OmniChatMediaAssetView
        asset={{ ...baseAsset, kind: 'video', thumbnail_url: '/api/v1/omnichat/media/id/thumbnail' }}
      />
    );

    await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
    expect(omnichatService.getMediaAssetContent).toHaveBeenCalled();
    expect(omnichatService.getMediaAssetThumbnail).not.toHaveBeenCalled();
  });
});
