import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPersonasTab from '../AdminPersonasTab';
import { adminService } from '../../../services/adminService';
import { omnichatService } from '../../../services/omnichatService';
import type { AdminOmniChatPersona } from '../../../types/admin';
import type { OmniChatPersonaVoice } from '../../../types/omnichat';

vi.mock('../../../services/adminService', () => ({
  adminService: {
    listOmniChatPersonas: vi.fn(),
    listOmniChatPersonaVoices: vi.fn(),
    updateOmniChatPersonaMedia: vi.fn(),
    updateOmniChatPersonaVoice: vi.fn(),
  },
}));

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    listVoicePresets: vi.fn(),
    previewVoicePreset: vi.fn(),
  },
}));

vi.mock('../../../services/mediaService', () => ({
  mediaService: { uploadMedia: vi.fn() },
}));

const renderTab = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminPersonasTab />
    </QueryClientProvider>
  );
};

const secondPersona: AdminOmniChatPersona = {
  id: 10,
  slug: 'second-persona',
  name: 'Second Persona',
  category: 'roleplay',
  gallery_urls: [],
  is_nsfw: false,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const secondBrowserVoice: OmniChatPersonaVoice = {
  persona_id: 10,
  provider: 'browser',
  voice_id: 'browser-10',
  voice_name: 'Character voice',
  model_id: 'browser-native',
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
  pitch: 1,
  active: true,
};

describe('AdminPersonasTab voice management', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.mocked(adminService.listOmniChatPersonas).mockResolvedValue([
      {
        id: 9,
        slug: 'admin-persona',
        name: 'Admin Persona',
        category: 'roleplay',
        gallery_urls: [],
        is_nsfw: false,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(adminService.listOmniChatPersonaVoices).mockResolvedValue([
      {
        persona_id: 9,
        provider: 'browser',
        voice_id: 'browser-9',
        voice_name: 'Character voice',
        model_id: 'browser-native',
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1,
        pitch: 1,
        active: true,
      },
    ]);
    vi.mocked(omnichatService.listVoicePresets).mockResolvedValue({
      presets: [
        {
          id: 'af_bella',
          name: 'Bella',
          gender: 'female',
          provider: 'voicebox',
          voice_id: 'af_bella',
          model_id: 'kokoro',
          language_code: 'en',
        },
      ],
      voicebox_available: true,
      voice_cloning_enabled: false,
    });
    vi.mocked(adminService.updateOmniChatPersonaVoice).mockResolvedValue({
      persona_id: 9,
      provider: 'voicebox',
      voice_id: 'af_bella',
      voice_name: 'Bella',
      model_id: 'kokoro',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      pitch: 1,
      active: true,
    });
    vi.mocked(omnichatService.previewVoicePreset).mockResolvedValue(
      new Blob(['audio'], { type: 'audio/wav' })
    );
  });

  it('previews and assigns a curated preset without accepting raw provider settings', async () => {
    const user = userEvent.setup();
    renderTab();

    const voiceSelect = await screen.findByRole('combobox', { name: 'Admin Persona voice' });
    expect(voiceSelect).toHaveValue('');
    await user.selectOptions(voiceSelect, 'af_bella');
    await user.click(screen.getByRole('button', { name: 'Preview Admin Persona voice' }));
    await waitFor(() =>
      expect(omnichatService.previewVoicePreset).toHaveBeenCalledWith(
        'af_bella',
        expect.any(AbortSignal)
      )
    );

    await user.click(screen.getByRole('button', { name: 'Save Admin Persona voice' }));
    await waitFor(() =>
      expect(adminService.updateOmniChatPersonaVoice).toHaveBeenCalledWith(9, 'af_bella')
    );
    expect(await screen.findByText('Voice saved.')).toBeInTheDocument();
  });

  it('prevents overlapping previews and voice saves across persona cards', async () => {
    vi.mocked(adminService.listOmniChatPersonas).mockResolvedValue([
      ...(await adminService.listOmniChatPersonas()),
      secondPersona,
    ]);
    vi.mocked(adminService.listOmniChatPersonaVoices).mockResolvedValue([
      ...(await adminService.listOmniChatPersonaVoices()),
      secondBrowserVoice,
    ]);

    let resolvePreview!: (blob: Blob) => void;
    vi.mocked(omnichatService.previewVoicePreset).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      })
    );
    let resolveSave!: (voice: OmniChatPersonaVoice) => void;
    vi.mocked(adminService.updateOmniChatPersonaVoice).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    const user = userEvent.setup();
    renderTab();
    const firstSelect = await screen.findByRole('combobox', { name: 'Admin Persona voice' });
    const secondSelect = screen.getByRole('combobox', { name: 'Second Persona voice' });
    await user.selectOptions(firstSelect, 'af_bella');
    await user.selectOptions(secondSelect, 'af_bella');

    await user.click(screen.getByRole('button', { name: 'Preview Admin Persona voice' }));
    expect(screen.getByRole('button', { name: 'Preview Second Persona voice' })).toBeDisabled();
    resolvePreview(new Blob(['audio'], { type: 'audio/wav' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview Second Persona voice' })).toBeEnabled()
    );

    await user.click(screen.getByRole('button', { name: 'Save Admin Persona voice' }));
    expect(screen.getByRole('button', { name: 'Save Second Persona voice' })).toBeDisabled();
    resolveSave({ ...secondBrowserVoice, persona_id: 9, provider: 'voicebox' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save Second Persona voice' })).toBeEnabled()
    );
  });

  it('releases preview audio object URLs when playback ends', async () => {
    const listeners = new Map<string, EventListener>();
    const audio = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        listeners.set(event, listener);
      }),
    };
    vi.stubGlobal(
      'Audio',
      vi.fn(function AudioMock() {
        return audio;
      })
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:admin-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

    const user = userEvent.setup();
    const rendered = renderTab();
    const voiceSelect = await screen.findByRole('combobox', { name: 'Admin Persona voice' });
    await user.selectOptions(voiceSelect, 'af_bella');
    await user.click(screen.getByRole('button', { name: 'Preview Admin Persona voice' }));
    await waitFor(() => expect(audio.play).toHaveBeenCalled());

    listeners.get('ended')?.(new Event('ended'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:admin-preview');
    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending voice preview when the admin leaves the page', async () => {
    let previewSignal: AbortSignal | undefined;
    vi.mocked(omnichatService.previewVoicePreset).mockImplementation(
      (_presetId: string, signal?: AbortSignal) => {
        previewSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
    );

    const user = userEvent.setup();
    const rendered = renderTab();
    const voiceSelect = await screen.findByRole('combobox', { name: 'Admin Persona voice' });
    await user.selectOptions(voiceSelect, 'af_bella');
    await user.click(screen.getByRole('button', { name: 'Preview Admin Persona voice' }));
    await waitFor(() => expect(previewSignal).toBeDefined());

    rendered.unmount();

    expect(previewSignal?.aborted).toBe(true);
  });
});
