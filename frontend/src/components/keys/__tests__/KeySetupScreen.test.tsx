import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyStatus } from '../../../contexts/AuthContext';
import KeySetupScreen, { FRESH_START_TEXT } from '../KeySetupScreen';
import en from '../../../../public/locales/en.json';

const auth = vi.hoisted(() => ({
  keyStatus: { state: 'ready' } as KeyStatus,
  acknowledgePhrase: vi.fn(),
  unlockWithPassword: vi.fn(),
  recoverKeys: vi.fn(),
  startFresh: vi.fn(),
  retryKeys: vi.fn(),
  logout: vi.fn(),
  setAppPassword: vi.fn(),
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

function showing(status: KeyStatus) {
  auth.keyStatus = status;
  return render(<KeySetupScreen />);
}

const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('when nothing is needed', () => {
  it.each<KeyStatus>([{ state: 'ready' }, { state: 'checking' }, { state: 'signed-out' }])(
    'covers nothing in the $state state',
    (status) => {
      const { container } = showing(status);
      expect(container).toBeEmptyDOMElement();
    }
  );
});

describe('the recovery phrase', () => {
  it('shows all twelve words in order, with no way to close or sign out', () => {
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(WORDS.map((word, i) => `${i + 1}${word}`));
    expect(screen.queryByRole('button', { name: 'keys.signOut' })).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('keys.phrase.title');
  });

  it('goes on only when three of the words are typed back', () => {
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    fireEvent.click(button('keys.phrase.saved'));
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs).toHaveLength(3);
    const positions = inputs.map((input) =>
      Number(JSON.parse(input.labels![0].textContent!.split(':').slice(1).join(':')).number)
    );
    expect(new Set(positions).size).toBe(3);

    inputs.forEach((input) => fireEvent.change(input, { target: { value: 'wrong' } }));
    fireEvent.click(button('keys.phrase.confirm'));
    expect(screen.getByRole('alert')).toHaveTextContent('keys.phrase.mismatch');
    expect(auth.acknowledgePhrase).not.toHaveBeenCalled();

    inputs.forEach((input, i) =>
      fireEvent.change(input, { target: { value: `  ${WORDS[positions[i] - 1].toUpperCase()} ` } })
    );
    fireEvent.click(button('keys.phrase.confirm'));
    expect(auth.acknowledgePhrase).toHaveBeenCalledOnce();
  });

  it('copies the phrase', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    fireEvent.click(button('keys.phrase.copy'));
    await waitFor(() => expect(button('keys.phrase.copied')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(PHRASE);
  });

  it('downloads the phrase as a text file', async () => {
    let saved: Blob | undefined;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        saved = blob;
        return 'blob:phrase';
      },
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    fireEvent.click(button('keys.phrase.download'));
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'omninudge-recovery-phrase.txt'
    );
    // jsdom's Blob has no text(); FileReader reads it the same way.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(saved!);
    });
    expect(text).toContain(PHRASE);
    click.mockRestore();
  });

  it('warns before the page is left while the phrase is on screen', () => {
    const { unmount } = showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    unmount();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

// Types back the three words the confirm step asks for.
function confirmWords() {
  fireEvent.click(button('keys.phrase.saved'));
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  inputs.forEach((input) => {
    const { number } = JSON.parse(input.labels![0].textContent!.split(':').slice(1).join(':'));
    fireEvent.change(input, { target: { value: WORDS[Number(number) - 1] } });
  });
  fireEvent.click(button('keys.phrase.confirm'));
}

describe('the app password offer', () => {
  // The offer reaches every account with no password, whichever provider it
  // signs in through, so the English text must not name only one of them.
  it('names every provider the sign-in screen offers', () => {
    const intro = en.keys.app.intro;
    for (const provider of ['Google', 'Discord', 'GitHub', 'Steam']) {
      expect(intro).toContain(provider);
    }
  });

  const offered = () => showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: true });

  function fill(password: string, confirmation: string) {
    fireEvent.change(screen.getByLabelText('keys.app.label'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('keys.app.confirmLabel'), {
      target: { value: confirmation },
    });
    fireEvent.click(button('keys.app.submit'));
  }

  it('comes after the phrase for an account with no password, and can be skipped', () => {
    offered();
    confirmWords();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('keys.app.title');
    expect(auth.acknowledgePhrase).not.toHaveBeenCalled();
    fireEvent.click(button('keys.app.skip'));
    expect(auth.acknowledgePhrase).toHaveBeenCalledOnce();
  });

  it('is not offered to an account that has a password', () => {
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    confirmWords();
    expect(screen.queryByLabelText('keys.app.label')).toBeNull();
    expect(auth.acknowledgePhrase).toHaveBeenCalledOnce();
  });

  it('sets the app password with the phrase still in hand', async () => {
    auth.setAppPassword.mockResolvedValue(undefined);
    offered();
    confirmWords();
    fill('app password', 'app password');
    await waitFor(() => expect(auth.setAppPassword).toHaveBeenCalledWith(PHRASE, 'app password'));
  });

  it('refuses a short or mismatched password before sending anything', () => {
    offered();
    confirmWords();
    fill('short', 'short');
    expect(screen.getByRole('alert')).toHaveTextContent('keys.app.short');
    fill('app password', 'another one');
    expect(screen.getByRole('alert')).toHaveTextContent('keys.app.mismatch');
    expect(auth.setAppPassword).not.toHaveBeenCalled();
  });

  it('says when the app password could not be added, and still allows a skip', async () => {
    auth.setAppPassword.mockRejectedValueOnce(new Error('offline'));
    offered();
    confirmWords();
    fill('app password', 'app password');
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.app.failed');
    fireEvent.click(button('keys.app.skip'));
    expect(auth.acknowledgePhrase).toHaveBeenCalledOnce();
  });
});

describe('the password step', () => {
  it('unlocks with the password and says so when it is wrong', async () => {
    auth.unlockWithPassword.mockRejectedValueOnce(new Error('Wrong password'));
    showing({ state: 'needs-password' });
    fireEvent.change(screen.getByLabelText('keys.password.label'), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(button('keys.password.submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.password.wrong');
    expect(auth.unlockWithPassword).toHaveBeenCalledWith('correct horse');
  });

  it('gives a general error for any other failure, and offers sign-out', async () => {
    auth.unlockWithPassword.mockRejectedValueOnce(new Error('offline'));
    showing({ state: 'needs-password' });
    fireEvent.change(screen.getByLabelText('keys.password.label'), { target: { value: 'x' } });
    fireEvent.click(button('keys.password.submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.password.failed');
    fireEvent.click(button('keys.signOut'));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});

describe('the recovery step', () => {
  it('sends the phrase as it was made: lower case, single spaces', async () => {
    auth.recoverKeys.mockResolvedValue(undefined);
    showing({ state: 'needs-recovery', hasRecoveryCopy: true });
    fireEvent.change(screen.getByLabelText('keys.recovery.label'), {
      target: {
        value: `  ${WORDS.slice(0, 6).join('  ').toUpperCase()}\n${WORDS.slice(6).join(' ')} `,
      },
    });
    fireEvent.click(button('keys.recovery.submit'));
    await waitFor(() => expect(auth.recoverKeys).toHaveBeenCalledWith(PHRASE));
  });

  it('says when the phrase does not unlock', async () => {
    auth.recoverKeys.mockRejectedValueOnce(new Error('OperationError'));
    showing({ state: 'needs-recovery', hasRecoveryCopy: true });
    fireEvent.change(screen.getByLabelText('keys.recovery.label'), {
      target: { value: PHRASE },
    });
    fireEvent.click(button('keys.recovery.submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.recovery.wrong');
  });

  it('leads a lost phrase to the fresh start, and back', () => {
    showing({ state: 'needs-recovery', hasRecoveryCopy: true });
    fireEvent.click(button('keys.recovery.lost'));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('keys.fresh.title');
    fireEvent.click(button('keys.fresh.back'));
    expect(screen.getByLabelText('keys.recovery.label')).toBeInTheDocument();
  });
});

describe('the fresh start', () => {
  it('starts fresh only after the confirmation is typed', async () => {
    auth.startFresh.mockResolvedValue(undefined);
    showing({ state: 'needs-recovery', hasRecoveryCopy: false });
    expect(screen.queryByLabelText('keys.recovery.label')).toBeNull();
    expect(screen.queryByRole('button', { name: 'keys.fresh.back' })).toBeNull();
    const submit = button('keys.fresh.submit');
    const field = screen.getByLabelText(`keys.fresh.confirmLabel:{"text":"${FRESH_START_TEXT}"}`);

    fireEvent.change(field, { target: { value: 'START' } });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(auth.startFresh).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: ' start fresh ' } });
    expect(submit).toBeEnabled();
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(auth.startFresh).toHaveBeenCalledOnce();
  });

  it('says when the fresh start fails', async () => {
    auth.startFresh.mockRejectedValueOnce(new Error('offline'));
    showing({ state: 'needs-recovery', hasRecoveryCopy: false });
    fireEvent.change(
      screen.getByLabelText(`keys.fresh.confirmLabel:{"text":"${FRESH_START_TEXT}"}`),
      { target: { value: FRESH_START_TEXT } }
    );
    fireEvent.click(button('keys.fresh.submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keys.fresh.failed');
  });
});

// jsdom has no layout, so the frame's stacking and scrolling are pinned by
// class here; both were measured in a real browser at 360x480 and 360x640.
describe('the gate frame', () => {
  it('makes the app behind inert and moves focus into the gate', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const { unmount } = showing({ state: 'needs-password' });
    expect(root).toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    unmount();
    expect(root).not.toHaveAttribute('inert');
    root.remove();
  });

  it('sits above every other app layer, the call screen included', () => {
    showing({ state: 'failed' });
    expect(screen.getByRole('dialog')).toHaveClass('z-[120]');
  });

  it('scrolls a tall step instead of centring it off the top of the screen', () => {
    showing({ state: 'show-phrase', phrase: PHRASE, offerAppPassword: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveClass('items-center');
    expect(dialog.firstElementChild).toHaveClass('m-auto');
  });
});

describe('a failed setup', () => {
  it('offers a retry and sign-out', async () => {
    auth.retryKeys.mockResolvedValue(undefined);
    showing({ state: 'failed' });
    await act(async () => {
      fireEvent.click(button('keys.failed.retry'));
    });
    expect(auth.retryKeys).toHaveBeenCalledOnce();
    fireEvent.click(button('keys.signOut'));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});
