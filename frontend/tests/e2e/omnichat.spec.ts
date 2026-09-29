import { test, expect, type Page, type Route, type WebSocketRoute } from '@playwright/test';
import { LOGIN_KEY_ACCOUNT_BACKUP, seedDeviceMessageKey } from './helpers/deviceKeys';

type MockPersona = {
  id: number;
  slug: string;
  name: string;
  description?: string;
  category: 'roleplay' | 'helper' | 'romance' | 'original' | 'anime_game' | 'fiction_media';
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

// The smallest catalog the guided roleplay creator accepts: one answer for
// every question, wired together the way the server wires them (the role
// allows the goal, the region holds the venue, the opening beat fits the
// region's kind, the user role allows the relationship).
const roleplayCatalog = {
  role_groups: [
    {
      id: 'guides',
      label: 'Guides',
      user_roles: ['traveler'],
      roles: [{ id: 'launch-guide', label: 'Launch guide', goals: ['ship'], min_age: 18 }],
    },
  ],
  goals: [{ id: 'ship', label: 'Ship the launch' }],
  regions: [{ id: 'harbor', label: 'Harbor City', kind: 'real', venues: ['dock'] }],
  venues: [{ id: 'dock', label: 'The dock' }],
  first_names: { woman: ['Ada'], man: ['Alan'] },
  last_names: ['Launch'],
  hair_colors: [{ id: 'black', label: 'Black' }],
  hair_styles: [{ id: 'short', label: 'Short' }],
  eye_colors: [{ id: 'brown', label: 'Brown' }],
  builds: [{ id: 'average', label: 'Average' }],
  wardrobes: [{ id: 'coat', label: 'A long coat' }],
  traits: [
    { id: 'precise', label: 'Precise' },
    { id: 'warm', label: 'Warm' },
  ],
  speech_styles: [{ id: 'concise', label: 'Concise' }],
  backstories: [{ id: 'sailor', label: 'A former sailor' }],
  user_roles: [{ id: 'traveler', label: 'A traveler', relationships: ['strangers'] }],
  relationships: [{ id: 'strangers', label: 'Strangers' }],
  opening_beats: [
    {
      id: 'arrival',
      label: 'You arrive at the dock',
      setting_kinds: ['real'],
      opening: 'Greetings from your launch-ready guide.',
    },
  ],
  response_styles: [{ id: 'natural_dialogue', label: 'Natural dialogue' }],
};

// The app talks to the API cross-origin (page on 127.0.0.1:4173, API on
// localhost:8080) and every request is credentialed — `withCredentials` on the
// axios client, `credentials: 'include'` in authenticatedFetch — because auth
// is cookie-backed. Chrome rejects a credentialed response whose
// Access-Control-Allow-Origin is the wildcard, so the origin has to be echoed
// back or the browser discards a response the route handler already fulfilled.
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'] ?? '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-CSRF-Token',
    vary: 'Origin',
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...corsHeaders(route),
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
    // This browser is a device that already holds the account's message key.
    public_key: await seedDeviceMessageKey(page),
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

  // A reply arrives on the websocket, never in the answer to the send. The page
  // used to get an in-page stand-in that opened and then could deliver nothing,
  // so once sending stopped returning the reply, no reply could ever appear.
  // Playwright plays the server end here; the page runs its real socket code.
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/v1\/ws(\?|$)/, (socket) => {
    sockets.push(socket);
    socket.onClose(() => {
      sockets.splice(sockets.indexOf(socket), 1);
    });
  });
  const pushToSockets = (event: { type: string; payload: unknown }) => {
    for (const socket of sockets) socket.send(JSON.stringify(event));
  };

  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(route),
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

    if (path === '/auth/key-backup' && request.method() === 'GET') {
      await fulfillJson(route, LOGIN_KEY_ACCOUNT_BACKUP);
      return;
    }

    if (path === '/auth/ws-token' && request.method() === 'POST') {
      await fulfillJson(route, { ws_token: 'playwright-ws-token' });
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

    if (path === '/omnichat/personas/creation-options' && request.method() === 'GET') {
      await fulfillJson(route, {
        limit: 5,
        owned: state.privatePersonas.length,
        catalog: roleplayCatalog,
        render_styles: ['realistic'],
      });
      return;
    }

    // The guided creator sends its answers, never a written persona: the
    // server builds the name, story and opening message from the choices.
    if (path === '/omnichat/personas' && request.method() === 'POST') {
      const { answers } = JSON.parse(request.postData() ?? '{}') as {
        answers: Record<string, string>;
      };
      const opening = roleplayCatalog.opening_beats.find(
        (beat) => beat.id === answers.opening_beat_id
      );
      const persona: MockPersona = {
        id: state.nextPersonaId++,
        slug: `u${authUser.id}-${answers.first_name}-${answers.last_name}`.toLowerCase(),
        name: `${answers.first_name} ${answers.last_name}`,
        description: 'A guided roleplay character.',
        category: 'roleplay',
        owner_user_id: authUser.id,
        visibility: 'private',
        source_format: 'native',
        is_nsfw: false,
        is_active: true,
        created_at: now,
        updated_at: now,
        first_message: opening?.opening ?? '',
      };
      state.privatePersonas.unshift(persona);
      await fulfillJson(route, persona, 201);
      return;
    }

    // The portraits render in the background after creation; none arrive here.
    if (/^\/omnichat\/omniai\/\d+\/likeness$/.test(path) && request.method() === 'GET') {
      await fulfillJson(route, { candidates: [], pending: 0 });
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
      const userMessage: MockMessage = {
        id: state.nextMessageId++,
        conversation_id: conversationId,
        role: 'user',
        content: payload.content ?? '',
        failed: false,
        created_at: now,
      };
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
        userMessage,
        assistantMessage,
      ];
      if (conversation) {
        conversation.last_message_preview = assistantMessage.content;
        conversation.last_message_at = now;
      }
      // As the real server answers: the turn is accepted, and the reply follows
      // on the socket once it is written.
      await fulfillJson(route, { accepted: true, user_message: userMessage });
      pushToSockets({ type: 'omnichat_message_complete', payload: assistantMessage });
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
  test('supports guest auth prompt plus create, chat, and delete flows', async ({ page }) => {
    const api = await installOmniChatApi(page);

    await page.goto('/omnichat');
    await page.getByRole('button', { name: /create roleplay ai/i }).click();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Signing in is entirely a server-side fact to this app: AuthContext drops
    // any legacy `auth_token` from web storage on mount and derives
    // `isAuthenticated` from whether GET /auth/me returned a user. Flipping the
    // mock is therefore the whole of "the browser is now signed in", and the
    // reload below is what makes AuthContext ask again.
    api.authenticate();

    await page.goto('/omnichat/new-roleplay');
    const next = page.getByRole('button', { name: /^continue$/i });

    await expect(page.getByRole('heading', { name: 'Concept' })).toBeVisible();
    await page.getByRole('button', { name: 'Launch guide' }).click();
    await page.getByLabel('What is their current goal?').selectOption('ship');
    await page.getByLabel('Where is the story set?').selectOption('harbor');
    await page.getByLabel('Where does this scene begin?').selectOption('dock');
    await next.click();

    await expect(page.getByRole('heading', { name: 'Identity' })).toBeVisible();
    await page.getByRole('button', { name: 'Woman' }).click();
    await page.getByLabel('First name').selectOption('Ada');
    await page.getByLabel('Last name').selectOption('Launch');
    await page.getByLabel('Hair color').selectOption('black');
    await page.getByLabel('Hair style').selectOption('short');
    await page.getByLabel('Eye color').selectOption('brown');
    await page.getByLabel('Build').selectOption('average');
    await page.getByLabel('Usual clothes or signature style').selectOption('coat');
    await next.click();

    await expect(page.getByRole('heading', { name: 'Personality' })).toBeVisible();
    await page.getByLabel('Main personality trait').selectOption('precise');
    await page.getByLabel('Another personality trait').selectOption('warm');
    await page.getByLabel('How do they speak?').selectOption('concise');
    await page.getByLabel('What shaped their past?').selectOption('sailor');
    await next.click();

    await expect(page.getByRole('heading', { name: 'Relationship' })).toBeVisible();
    await page.getByLabel('Who are you in this story?').selectOption('traveler');
    await page.getByLabel('How do you know each other?').selectOption('strangers');
    await next.click();

    await expect(page.getByRole('heading', { name: 'Opening' })).toBeVisible();
    await page.getByRole('button', { name: 'You arrive at the dock' }).click();
    await next.click();

    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
    await page.getByRole('button', { name: /^create character$/i }).click();

    await expect(page.getByRole('heading', { name: 'Meet Ada Launch' })).toBeVisible();
    await page.getByRole('button', { name: /^start chat$/i }).click();
    await expect(page).toHaveURL(/\/omnichat\/c\/\d+$/);
    await expect(
      page.getByText('Greetings from your launch-ready guide.', { exact: true }).last()
    ).toBeVisible();

    await page.getByPlaceholder(/say or do something/i).fill('Hello there');
    await page.getByRole('button', { name: /^send(?: message)?$/i }).click();
    await expect(page.getByText('Hello there', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Replying to: Hello there', { exact: true }).last()).toBeVisible();

    await page.goto('/omnichat/studio');
    const character = page.getByRole('article', { name: 'Ada Launch' });
    await expect(character).toBeVisible();
    await character.getByRole('button', { name: 'Delete Ada Launch' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /delete character/i })
      .click();

    await expect(character).not.toBeVisible();
    await expect(page.getByText('You have no characters yet.')).toBeVisible();
  });
});
