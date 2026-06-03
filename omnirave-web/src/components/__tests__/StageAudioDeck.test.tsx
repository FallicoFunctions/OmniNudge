import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageAudioDeck } from '../StageAudioDeck';

describe('StageAudioDeck', () => {
  it('renders iframe-backed YouTube players for all OmniRave zones', () => {
    const onPlayersReady = vi.fn();

    render(
      <StageAudioDeck
        zoneMedia={[
          { zoneId: 'main_stage', videoId: 'main-stage-youtube', playlistIndex: 0, playheadSeconds: 11 },
          { zoneId: 'techno_room', videoId: 'techno-room-youtube', playlistIndex: 0, playheadSeconds: 22 },
          { zoneId: 'neon_room', videoId: 'neon-room-youtube', playlistIndex: 0, playheadSeconds: 33 },
        ]}
        onPlayersReady={onPlayersReady}
      />,
    );

    const main = screen.getByTitle('OmniRave Main Stage player');
    const techno = screen.getByTitle('OmniRave The Underground player');
    const neon = screen.getByTitle('OmniRave P.L.U.R.R. Partay player');

    expect(main).toHaveAttribute('src', expect.stringContaining('main-stage-youtube'));
    expect(techno).toHaveAttribute('src', expect.stringContaining('techno-room-youtube'));
    expect(neon).toHaveAttribute('src', expect.stringContaining('neon-room-youtube'));
    expect(onPlayersReady).toHaveBeenCalled();
  });
});
