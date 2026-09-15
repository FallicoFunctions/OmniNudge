import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import {
  replacePhraseWithPassword,
  replacePhraseWithPhrase,
} from '../../../services/accountKeysService';
import EncryptionSettings from '../EncryptionSettings';

const auth = vi.hoisted(() => ({ setAppPassword: vi.fn() }));

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('../../../services/accountKeysService', () => ({
  replacePhraseWithPassword: vi.fn(),
  replacePhraseWithPhrase: vi.fn(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

const PHRASE = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
const WORDS = PHRASE.split(' ');
const NEW_PHRASE = 'mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray';
const NEW_WORDS = NEW_PHRASE.split(' ');

const passwordAccount = {
  auth_scheme: 2,
  has_password: true,
  kdf_salt: 's',
  kdf_iterations: 600000,
};
const noPasswordAccount = { auth_scheme: 1, has_password: false };

const button = (name: string) => screen.getByRole('button', { name });

async function renderWith(backup: object) {
  vi.mocked(api.get).mockResolvedValue(backup);
  render(<EncryptionSettings />);
  await screen.findByText('keys.settings.title');
}

// Types back the three words the confirm step asks for.
function confirmWords() {
  fireEvent.click(button('keys.phrase.saved'));
  const inputs = screen
    .getAllByRole('textbox')
    .filter((input) => input.id.startsWith('phrase-word-')) as HTMLInputElement[];
  inputs.forEach((input) => {
    const { number } = JSON.parse(input.labels![0].textContent!.split(':').slice(1).join(':'));
    fireEvent.change(input, { target: { value: NEW_WORDS[Number(number) - 1] } });
  });
  fireEvent.click(button('keys.phrase.confirm'));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('a new recovery phrase', () => {
  it('confirms a password account with its password, and saves only once the words are typed back', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(replacePhraseWithPassword).mockResolvedValue({ phrase: NEW_PHRASE, save });
    await renderWith(passwordAccount);
    expect(screen.queryByLabelText('keys.app.label')).toBeNull();

    fireEvent.change(screen.getByLabelText('keys.settings.passwordLabel'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(button('keys.settings.start'));
    await screen.findByText('keys.phrase.title');
    expect(replacePhraseWithPassword).toHaveBeenCalledWith('correct horse');
    expect(save).not.toHaveBeenCalled();

    confirmWords();
    await screen.findByText('keys.settings.saved');
    expect(save).toHaveBeenCalledOnce();
  });

  it('says when the password is wrong, and shows no phrase', async () => {
    vi.mocked(replacePhraseWithPassword).mockRejectedValue(new Error('Wrong password'));
    await renderWith(passwordAccount);
    fireEvent.change(screen.getByLabelText('keys.settings.passwordLabel'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(button('keys.settings.start'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.settings.wrongPassword');
    expect(screen.queryByText('keys.phrase.title')).toBeNull();
  });

  it('offers only a save again when the save fails, since it may have reached the server', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    vi.mocked(replacePhraseWithPassword).mockResolvedValue({ phrase: NEW_PHRASE, save });
    await renderWith(passwordAccount);
    fireEvent.change(screen.getByLabelText('keys.settings.passwordLabel'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(button('keys.settings.start'));
    await screen.findByText('keys.phrase.title');
    confirmWords();

    expect(await screen.findByRole('alert')).toHaveTextContent('keys.settings.saveFailed');
    // The save may have reached the server, so the new phrase must not be dropped.
    expect(screen.queryByRole('button', { name: 'keys.settings.cancel' })).toBeNull();
    fireEvent.click(button('keys.settings.retry'));
    await screen.findByText('keys.settings.saved');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('drops a phrase that was never saved when the user cancels', async () => {
    const save = vi.fn();
    vi.mocked(replacePhraseWithPassword).mockResolvedValue({ phrase: NEW_PHRASE, save });
    await renderWith(passwordAccount);
    fireEvent.change(screen.getByLabelText('keys.settings.passwordLabel'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(button('keys.settings.start'));
    await screen.findByText('keys.phrase.title');
    fireEvent.click(button('keys.settings.cancel'));
    expect(screen.getByLabelText('keys.settings.passwordLabel')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('tells an account still on the old sign-in to sign in again', async () => {
    await renderWith({ auth_scheme: 1, has_password: true });
    expect(screen.getByText('keys.settings.unavailable')).toBeInTheDocument();
    expect(screen.queryByLabelText('keys.settings.passwordLabel')).toBeNull();
  });

  it('confirms an account with no password with its current phrase, cleaned as it was made', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(replacePhraseWithPhrase).mockResolvedValue({ phrase: NEW_PHRASE, save });
    await renderWith(noPasswordAccount);
    fireEvent.change(
      screen.getByLabelText('keys.settings.phraseLabel', { selector: '#settings-phrase-secret' }),
      {
        target: { value: `  ${WORDS.join('  ').toUpperCase()} ` },
      }
    );
    fireEvent.click(button('keys.settings.start'));
    await screen.findByText('keys.phrase.title');
    expect(replacePhraseWithPhrase).toHaveBeenCalledWith(PHRASE);
  });
});

describe('the app password in Settings', () => {
  it('is offered only to an account with no password, proved with its phrase', async () => {
    auth.setAppPassword.mockResolvedValue(undefined);
    await renderWith(noPasswordAccount);
    fireEvent.change(
      screen.getByLabelText('keys.settings.phraseLabel', { selector: '#settings-app-phrase' }),
      {
        target: { value: ` ${PHRASE.toUpperCase()} ` },
      }
    );
    fireEvent.change(screen.getByLabelText('keys.app.label'), {
      target: { value: 'app password' },
    });
    fireEvent.change(screen.getByLabelText('keys.app.confirmLabel'), {
      target: { value: 'app password' },
    });
    vi.mocked(api.get).mockResolvedValue(passwordAccount);
    fireEvent.click(button('keys.app.submit'));

    await screen.findByText('keys.settings.appAdded');
    expect(auth.setAppPassword).toHaveBeenCalledWith(PHRASE, 'app password');
    await waitFor(() => expect(screen.queryByLabelText('keys.app.label')).toBeNull());
  });

  it('refuses a mismatched password before sending anything', async () => {
    await renderWith(noPasswordAccount);
    fireEvent.change(
      screen.getByLabelText('keys.settings.phraseLabel', { selector: '#settings-app-phrase' }),
      {
        target: { value: PHRASE },
      }
    );
    fireEvent.change(screen.getByLabelText('keys.app.label'), {
      target: { value: 'app password' },
    });
    fireEvent.change(screen.getByLabelText('keys.app.confirmLabel'), {
      target: { value: 'another one' },
    });
    fireEvent.click(button('keys.app.submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.app.mismatch');
    expect(auth.setAppPassword).not.toHaveBeenCalled();
  });
});
