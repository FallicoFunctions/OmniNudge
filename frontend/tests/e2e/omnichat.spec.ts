import { test, expect, type Page, type Route } from '@playwright/test';

type MockPersona = {
  id: number;
  slug: string;
  name: string;
  description?: string;
  category:
    | 'roleplay'
    | 'helper'
    | 'romance'
    | 'original'
    | 'anime_game'
    | 'fiction_media';
  owner_user_id?: number;
  visibility?: 'public' | 'private' | 'unlisted';
  source_format?: string;
  avatar_url?: string;
  preview_video_url?: string;
  gallery_urls?: string[];
  tags?: string[];
  creator_name?: string;
  character_version?: string;
  is_nsfw: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  system_prompt?: string;
  personality?: string;
  scenario?: string;
  first_message?: string;
  example_dialogue?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  creator_notes?: string;
  character_book_json?: Record<string, unknown>;
  extensions_json?: Record<string, unknown>;
  import_source_filename?: string;
};

type MockConversation = {
  id: number;
  user_id: number;
  persona_id: number;
  title?: string;
  last_message_preview?: string;
  created_at: string;
  last_message_at: string;
  persona?: MockPersona;
  settings?: {
    user_name: string;
    user_age: string;
    user_gender: string;
  };
};

type MockMessage = {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  failed: boolean;
  created_at: string;
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function installOmniChatApi(page: Page) {
  const now = '2026-07-11T12:00:00Z';
  const authUser = {
    id: 7,
    username: 'launch-owner',
    email: 'launch-owner@example.com',
    role: 'user',
    public_key: null,
  };

  const publicPersona: MockPersona = {
    id: 101,
    slug: 'guide-bot',
    name: 'Guide Bot',
    description: 'Public launch guide.',
    category: 'helper',
    visibility: 'public',
    source_format: 'native',
    is_nsfw: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    system_prompt: 'Be helpful.',
    personality: 'Crisp',
    scenario: 'Launch support',
    first_message: 'Welcome to OmniChat.',
    example_dialogue: '',
    post_history_instructions: '',
    alternate_greetings: [],
    creator_notes: '',
    tags: ['guide'],
    creator_name: 'OmniNudge',
    character_version: '1.0',
    character_book_json: {},
    extensions_json: {},
  };

  const state = {
    isAuthenticated: false,
    nextPersonaId: 200,
    nextConversationId: 300,
    nextMessageId: 400,
    publicPersonas: [publicPersona],
    privatePersonas: [] as MockPersona[],
    conversations: [] as MockConversation[],
    messagesByConversationId: {} as Record<number, MockMessage[]>,
  };

  await page.addInitScript(() => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = MockWebSocket.OPEN;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor() {
        window.setTimeout(() => {
          this.onopen?.(new Event('open'));
        }, 0);
      }

      send() {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new Event('close'));
      }

      addEventListener() {}

      removeEventListener() {}
    }

    // @ts-expect-error browser stub for deterministic e2e.
    window.WebSocket = MockWebSocket;
  });

  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: CORS_HEADERS,
      });
      return;
    }

    if (path === '/auth/me' && request.method() === 'GET') {
      if (!state.isAuthenticated) {
        await fulfillJson(route, { error: 'Unauthorized', message: 'Unauthorized' }, 401);
        return;
      }
      await fulfillJson(route, authUser);
      return;
    }

    if (path === '/auth/ws-token' && request.method() === 'POST') {
      await fulfillJson(route, { ws_token: 'playwright-ws-token' });
      return;
    }

    if (path === '/media/upload' && request.method() === 'POST') {
      await fulfillJson(route, {
        data: {
          id: 1,
          user_id: authUser.id,
          filename: 'imported-avatar.png',
          original_filename: 'imported-avatar.png',
          file_type: 'image/png',
          file_size: 512,
          storage_url: '/uploads/imported-avatar.png',
          storage_path: 'uploads/imported-avatar.png',
          uploaded_at: now,
        },
      });
      return;
    }

    if (path === '/omnichat/personas' && request.method() === 'GET') {
      const personas = state.isAuthenticated
        ? [...state.publicPersonas, ...state.privatePersonas]
        : [...state.publicPersonas];
      await fulfillJson(route, { personas });
      return;
    }

    if (path === '/omnichat/my-personas' && request.method() === 'GET') {
      await fulfillJson(route, { personas: state.privatePersonas });
      return;
    }

    if (path === '/omnichat/personas' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}') as Partial<MockPersona>;
      const persona: MockPersona = {
        id: state.nextPersonaId++,
        slug: `u${authUser.id}-${String(payload.name ?? 'persona').toLowerCase().replace(/\s+/g, '-')}`,
        name: String(payload.name ?? 'Unnamed Persona'),
        description: payload.description ? String(payload.description) : '',
        category: (payload.category as MockPersona['category']) ?? 'original',
        owner_user_id: authUser.id,
        visibility: 'private',
        source_format: 'native',
        avatar_url: payload.avatar_url ? String(payload.avatar_url) : undefined,
        preview_video_url: payload.preview_video_url
          ? String(payload.preview_video_url)
          : undefined,
        gallery_urls: Array.isArray(payload.gallery_urls) ? payload.gallery_urls.map(String) : [],
        tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
        creator_name: payload.creator_name ? String(payload.creator_name) : '',
        character_version: payload.character_version ? String(payload.character_version) : '',
        is_nsfw: Boolean(payload.is_nsfw),
        is_active: true,
        created_at: now,
        updated_at: now,
        system_prompt: payload.system_prompt ? String(payload.system_prompt) : '',
        personality: payload.personality ? String(payload.personality) : '',
        scenario: payload.scenario ? String(payload.scenario) : '',
        first_message: payload.first_message ? String(payload.first_message) : '',
        example_dialogue: payload.example_dialogue ? String(payload.example_dialogue) : '',
        post_history_instructions: payload.post_history_instructions
          ? String(payload.post_history_instructions)
          : '',
        alternate_greetings: Array.isArray(payload.alternate_greetings)
          ? payload.alternate_greetings.map(String)
          : [],
        creator_notes: payload.creator_notes ? String(payload.creator_notes) : '',
        character_book_json:
          payload.character_book_json && typeof payload.character_book_json === 'object'
            ? (payload.character_book_json as Record<string, unknown>)
            : {},
        extensions_json:
          payload.extensions_json && typeof payload.extensions_json === 'object'
            ? (payload.extensions_json as Record<string, unknown>)
            : {},
      };
      state.privatePersonas.unshift(persona);
      await fulfillJson(route, { persona }, 201);
      return;
    }

    if (path === '/omnichat/personas/import' && request.method() === 'POST') {
      const body = request.postData() ?? '';
      const isPng = body.includes('filename="') && body.toLowerCase().includes('.png');
      const persona: MockPersona = {
        id: state.nextPersonaId++,
        slug: `u${authUser.id}-${isPng ? 'hogwarts-simulator' : 'imported-archivist'}`,
        name: isPng ? 'Hogwarts Simulator' : 'Imported Archivist',
        description: isPng ? 'Imported from a PNG card.' : 'Imported from a JSON card.',
        category: 'roleplay',
        owner_user_id: authUser.id,
        visibility: 'private',
        source_format: 'chara_card_v2',
        avatar_url: '/uploads/imported-avatar.png',
        preview_video_url: undefined,
        gallery_urls: [],
        tags: ['imported'],
        creator_name: 'Playwright',
        character_version: '1.0',
        is_nsfw: false,
        is_active: true,
        created_at: now,
        updated_at: now,
        system_prompt: 'Stay in role.',
        personality: 'Immersive',
        scenario: 'A testable imported world.',
        first_message: 'The imported story begins now.',
        example_dialogue: '',
        post_history_instructions: '',
        alternate_greetings: [],
        creator_notes: '',
        character_book_json: {},
        extensions_json: {},
        import_source_filename: isPng ? 'hogwarts.png' : 'archivist.json',
      };
      state.privatePersonas.unshift(persona);
      await fulfillJson(route, { persona }, 201);
      return;
    }

    const personaDefinitionMatch = path.match(/^\/omnichat\/personas\/(\d+)$/);
    if (personaDefinitionMatch && request.method() === 'GET') {
      const personaId = Number(personaDefinitionMatch[1]);
      const persona = [...state.publicPersonas, ...state.privatePersonas].find(
        (entry) => entry.id === personaId
      );
      await fulfillJson(route, { persona });
      return;
    }

    if (personaDefinitionMatch && request.method() === 'DELETE') {
      const personaId = Number(personaDefinitionMatch[1]);
      state.privatePersonas = state.privatePersonas.filter((entry) => entry.id !== personaId);
      await fulfillJson(route, { message: 'persona deleted' });
      return;
    }

    if (path === '/omnichat/conversations' && request.method() === 'GET') {
      await fulfillJson(route, { conversations: state.conversations });
      return;
    }

    if (path === '/omnichat/conversations' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() ?? '{}') as {
        persona_id: number;
        title?: string;
      };
      const persona = [...state.publicPersonas, ...state.privatePersonas].find(
        (entry) => entry.id === payload.persona_id
      );
      if (!persona) {
        await fulfillJson(route, { error: 'Not found', message: 'Persona not found' }, 404);
        return;
      }

      const conversationId = state.nextConversationId++;
      const firstAssistantMessage: MockMessage = {
        id: state.nextMessageId++,
        conversation_id: conversationId,
        role: 'assistant',
        content: persona.first_message || 'Hello from the bot.',
        failed: false,
        created_at: now,
      };
      state.messagesByConversationId[conversationId] = [firstAssistantMessage];
      const conversation: MockConversation = {
        id: conversationId,
        user_id: authUser.id,
        persona_id: persona.id,
        title: payload.title ?? `${persona.name} Thread`,
        last_message_preview: firstAssistantMessage.content,
        created_at: now,
        last_message_at: now,
        persona,
        settings: {
          user_name: '',
          user_age: '',
          user_gender: '',
        },
      };
      state.conversations.unshift(conversation);
      await fulfillJson(route, conversation, 200);
      return;
    }

    const conversationMatch = path.match(/^\/omnichat\/conversations\/(\d+)$/);
    if (conversationMatch && request.method() === 'GET') {
      const conversationId = Number(conversationMatch[1]);
      const conversation = state.conversations.find((entry) => entry.id === conversationId);
      await fulfillJson(route, {
        conversation,
        messages: state.messagesByConversationId[conversationId] ?? [],
      });
      return;
    }

    const messageMatch = path.match(/^\/omnichat\/conversations\/(\d+)\/messages$/);
    if (messageMatch && request.method() === 'POST') {
      const conversationId = Number(messageMatch[1]);
      const payload = JSON.parse(request.postData() ?? '{}') as { content?: string };
      const conversation = state.conversations.find((entry) => entry.id === conversationId);
      const assistantMessage: MockMessage = {
        id: state.nextMessageId++,
        conversation_id: conversationId,
        role: 'assistant',
        content: `Replying to: ${payload.content ?? ''}`,
        failed: false,
        created_at: now,
      };
      state.messagesByConversationId[conversationId] = [
        ...(state.messagesByConversationId[conversationId] ?? []),
        {
          id: state.nextMessageId++,
          conversation_id: conversationId,
          role: 'user',
          content: payload.content ?? '',
          failed: false,
          created_at: now,
        },
        assistantMessage,
      ];
      if (conversation) {
        conversation.last_message_preview = assistantMessage.content;
        conversation.last_message_at = now;
      }
      await fulfillJson(route, assistantMessage);
      return;
    }

    await fulfillJson(route, { error: 'Unhandled route', message: path }, 500);
  });

  return {
    authenticate() {
      state.isAuthenticated = true;
    },
  };
}

test.describe('OmniChat launch smoke', () => {
  test('supports guest auth prompt plus create, PNG import, chat, and delete flows', async ({
    page,
  }) => {
    const api = await installOmniChatApi(page);

    await page.goto('/omnichat');
    await page.getByRole('button', { name: /create or import character/i }).click();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    api.authenticate();
    await page.evaluate(() => {
      sessionStorage.setItem('auth_token', 'playwright-auth-token');
    });

    await page.goto('/omnichat/studio');
    await page.getByRole('textbox', { name: /^Name$/ }).fill('Launch Wizard');
    await page.getByRole('textbox', { name: /^Description$/ }).fill(
      'Helps validate the launch path.'
    );
    await page.getByRole('textbox', { name: /^Personality$/ }).fill('Precise and concise.');
    await page
      .getByRole('textbox', { name: /^Opening Message$/ })
      .fill('Greetings from your launch-ready bot.');
    await page.getByRole('button', { name: /create character/i }).click();

    await expect(page.getByRole('heading', { name: 'Launch Wizard' })).toBeVisible();
    await expect(page.getByRole('button', { name: /open chat/i })).toBeVisible();

    await page.getByRole('button', { name: /open chat/i }).click();
    await expect(page).toHaveURL(/\/omnichat\/c\/\d+$/);
    await expect(
      page.getByText('Greetings from your launch-ready bot.', { exact: true }).last()
    ).toBeVisible();

    await page.getByPlaceholder(/say or do something/i).fill('Hello there');
    await page.getByRole('button', { name: /^send(?: message)?$/i }).click();
    await expect(page.getByText('Hello there', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Replying to: Hello there', { exact: true }).last()).toBeVisible();

    await page.goto('/omnichat/studio');
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: 'hogwarts.png',
        mimeType: 'image/png',
        buffer: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
          0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
          0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
          0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01,
          0x00, 0x18, 0xdd, 0x8d, 0xb1, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
          0xae, 0x42, 0x60, 0x82,
        ]),
      });

    await expect(page.getByRole('heading', { name: 'Hogwarts Simulator' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Avatar Image' })).toHaveAttribute(
      'src',
      /\/uploads\/imported-avatar\.png$/
    );

    await page.getByRole('button', { name: /^delete$/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /delete character/i }).click();

    await expect(page.getByRole('heading', { name: 'Hogwarts Simulator' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Launch Wizard' })).toBeVisible();
  });
});
