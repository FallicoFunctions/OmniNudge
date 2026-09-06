import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatMediaAssetView from '../OmniChatMediaAssetView';
import type { OmniChatMediaAsset } from '../../../types/omnichat';

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
  content_url: '/api/v1/omnichat/media/0bf893df-9031-49e3-94d5-71ab5ee875c5/content',
  created_at: '2026-07-20T12:00:00Z',
};

const clip: OmniChatMediaAsset = {
  ...baseAsset,
  kind: 'video',
  file_type: 'video/mp4',
  thumbnail_url: '/api/v1/omnichat/media/0bf893df-9031-49e3-94d5-71ab5ee875c5/thumbnail',
};

// The whole point of the change: the element fetches, not us. A blob is a whole
// download however well the route can serve part of one, so anything that reads
// the bytes into script first gives up ranges, seeking, the browser cache and
// native lazy loading.
function fetchSpy() {
  const spy = vi.fn();
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('OmniChatMediaAssetView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('points an image at the API route instead of reading it into script', async () => {
    const fetches = fetchSpy();
    render(<OmniChatMediaAssetView asset={baseAsset} />);

    const image = await screen.findByRole('img', { name: 'Sadie at the park' });
    expect(image).toHaveAttribute(
      'src',
      'http://localhost:8080/api/v1/omnichat/media/0bf893df-9031-49e3-94d5-71ab5ee875c5/content'
    );
    expect(fetches).not.toHaveBeenCalled();
  });

  // Native, so the browser decides -- it already defers a tile below the fold
  // and knows the viewport better than a component does.
  it('leaves lazy loading to the browser', async () => {
    render(<OmniChatMediaAssetView asset={baseAsset} />);

    expect(await screen.findByRole('img', { name: 'Sadie at the park' })).toHaveAttribute(
      'loading',
      'lazy'
    );
  });

  it('renders a clip with controls and asks only for its metadata', async () => {
    const fetches = fetchSpy();
    render(<OmniChatMediaAssetView asset={clip} />);

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute('controls');
    // preload="metadata" only means anything now that the route answers byte
    // ranges. Before, the whole clip arrived regardless.
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute(
      'src',
      'http://localhost:8080/api/v1/omnichat/media/0bf893df-9031-49e3-94d5-71ab5ee875c5/content'
    );
    expect(fetches).not.toHaveBeenCalled();
  });

  // The clip is still arriving when the element appears. Without this the tile
  // goes black between the thumbnail and the first frame.
  it('shows the thumbnail as the clip poster', () => {
    render(<OmniChatMediaAssetView asset={clip} />);

    expect(document.querySelector('video')).toHaveAttribute(
      'poster',
      'http://localhost:8080/api/v1/omnichat/media/0bf893df-9031-49e3-94d5-71ab5ee875c5/thumbnail'
    );
  });

  it('sends a public asset to the route the publication names', async () => {
    render(
      <OmniChatMediaAssetView
        asset={{
          ...baseAsset,
          visibility: 'public',
          content_url: '/api/v1/omnichat/explore/media/asset-1/content',
        }}
      />
    );

    expect(await screen.findByRole('img', { name: 'Sadie at the park' })).toHaveAttribute(
      'src',
      'http://localhost:8080/api/v1/omnichat/explore/media/asset-1/content'
    );
  });

  // A URL from a compromised publication record must never be assigned.
  it('refuses a content URL from another origin', () => {
    render(
      <OmniChatMediaAssetView asset={{ ...baseAsset, content_url: 'https://evil.test/steal.png' }} />
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  // An element reports its own failure, and the retry has to ask for something
  // the browser has not already failed on or the cache answers with the same
  // failure.
  it('offers a retry that asks again rather than repeating a cached failure', async () => {
    render(<OmniChatMediaAssetView asset={baseAsset} />);

    fireEvent.error(await screen.findByRole('img', { name: 'Sadie at the park' }));
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    const image = await screen.findByRole('img', { name: 'Sadie at the park' });
    expect(image.getAttribute('src')).toContain('?retry=1');
  });

  // The separator depends on the URL it is appended to, and the two URLs here
  // are different URLs. A suffix computed once from the content URL and pasted
  // onto the thumbnail produces "...jpg&retry=1" with no question mark the
  // moment only one of them carries a query -- which is why this asks for the
  // tile, where the thumbnail is the URL being appended to.
  it('joins the retry to whichever url it is appending to', async () => {
    render(
      <OmniChatMediaAssetView
        asset={{
          ...clip,
          content_url: '/api/v1/omnichat/media/asset-1/content?v=2',
          thumbnail_url: '/api/v1/omnichat/media/asset-1/thumbnail',
        }}
        preview
      />
    );

    fireEvent.error(await screen.findByRole('img', { name: 'Sadie at the park' }));
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    const src = (await screen.findByRole('img', { name: 'Sadie at the park' })).getAttribute('src');
    expect(src).toContain('/thumbnail?retry=1');
    expect(src).not.toContain('&retry=1');
  });

  describe('as a grid tile', () => {
    it('shows the thumbnail and never points at the asset', async () => {
      render(<OmniChatMediaAssetView asset={clip} preview />);

      const thumbnail = await screen.findByRole('img', { name: 'Sadie at the park' });
      expect(thumbnail.getAttribute('src')).toContain('/thumbnail');
      expect(thumbnail.getAttribute('src')).not.toContain('/content');
      expect(document.querySelector('video')).toBeNull();
      // A grid mounts every tile at once. Without this the twenty below the
      // fold all fetch immediately, whether or not anybody scrolls to them.
      expect(thumbnail).toHaveAttribute('loading', 'lazy');
    });

    // A clip made before thumbnails existed, or one whose thumbnail could not
    // be made. Falling back to the asset would put the whole download back for
    // exactly those.
    it('shows a placeholder rather than the asset when there is no thumbnail', () => {
      const withoutThumbnail: OmniChatMediaAsset = { ...clip };
      delete withoutThumbnail.thumbnail_url;
      render(<OmniChatMediaAssetView asset={withoutThumbnail} preview />);

      expect(screen.getByRole('button', { name: 'Play generated video' })).toBeInTheDocument();
      expect(document.querySelector('img')).toBeNull();
      expect(document.querySelector('video')).toBeNull();
    });

    // The gallery is still where clips are watched, so a tile has to be able to
    // become one.
    it('plays the clip once the viewer asks for it', async () => {
      render(<OmniChatMediaAssetView asset={clip} preview />);

      fireEvent.click(await screen.findByRole('button', { name: 'Play generated video' }));

      const video = document.querySelector('video');
      expect(video).toBeTruthy();
      expect(video?.getAttribute('src')).toContain('/content');
    });

    // A generated image is about a megabyte of PNG shown in a tile a few
    // hundred pixels wide, so it needs its thumbnail as much as a clip does.
    it('shows an image tile from its thumbnail too', async () => {
      render(
        <OmniChatMediaAssetView
          asset={{ ...baseAsset, thumbnail_url: '/api/v1/omnichat/media/id/thumbnail' }}
          preview
        />
      );

      const thumbnail = await screen.findByRole('img', { name: 'Sadie at the park' });
      expect(thumbnail.getAttribute('src')).toContain('/thumbnail');
    });
  });

  // Load-bearing, and invisible when it is missing until every picture is gone.
  //
  // The API is its own origin in development and under the deployment that puts
  // it on api.omninudge.com. A cross-origin img or video sends NO cookie unless
  // it is asked to, so without this the session never arrives, every request is
  // a 401, and all media is broken. The attribute is ignored when the API is
  // same-origin, so it is right either way.
  describe('credentials', () => {
    it('asks every element to send the session', async () => {
      render(<OmniChatMediaAssetView asset={baseAsset} />);
      expect(await screen.findByRole('img', { name: 'Sadie at the park' })).toHaveAttribute(
        'crossorigin',
        'use-credentials'
      );
    });

    it('asks the clip to send the session', () => {
      render(<OmniChatMediaAssetView asset={clip} />);
      expect(document.querySelector('video')).toHaveAttribute('crossorigin', 'use-credentials');
    });

    it('asks the tile to send the session', async () => {
      render(<OmniChatMediaAssetView asset={clip} preview />);
      expect(await screen.findByRole('img', { name: 'Sadie at the park' })).toHaveAttribute(
        'crossorigin',
        'use-credentials'
      );
    });
  });
});
