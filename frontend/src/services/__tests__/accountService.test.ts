import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api';
import { accountProof } from '../accountKeysService';
import { accountService } from '../accountService';

vi.mock('../api', () => ({ default: { post: vi.fn(), get: vi.fn(), defaults: {} } }));
vi.mock('../accountKeysService', () => ({ accountProof: vi.fn() }));

const bodySentTo = (path: string) =>
  vi.mocked(api.post).mock.calls.find(([p]) => p === path)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.post).mockResolvedValue({ data: {} });
});

describe('re-authenticated account actions', () => {
  it('proves a data export with the login key, never the password, for a login-key account', async () => {
    vi.mocked(accountProof).mockResolvedValue({ login_key: 'the-login-key' });
    await accountService.requestDataExport('keyholder', 'correct horse', {
      data_types: ['profile'],
      include_deleted: false,
    });
    expect(accountProof).toHaveBeenCalledWith('keyholder', 'correct horse');
    const body = bodySentTo('/account/export');
    expect(body).toEqual({
      login_key: 'the-login-key',
      data_types: ['profile'],
      include_deleted: false,
    });
    expect(JSON.stringify(body)).not.toContain('correct horse');
  });

  it('proves an account deletion the same way', async () => {
    vi.mocked(accountProof).mockResolvedValue({ login_key: 'the-login-key' });
    await accountService.requestAccountDeletion('keyholder', 'correct horse', 'DELETE');
    const body = bodySentTo('/account/delete');
    expect(body).toEqual({ login_key: 'the-login-key', confirm: 'DELETE' });
    expect(JSON.stringify(body)).not.toContain('correct horse');
  });

  it('sends the password for an account still on the old scheme', async () => {
    vi.mocked(accountProof).mockResolvedValue({ password: 'correct horse' });
    await accountService.requestDataExport('oldschool', 'correct horse', {
      data_types: [],
      include_deleted: false,
    });
    expect(bodySentTo('/account/export')).toMatchObject({ password: 'correct horse' });
  });
});
