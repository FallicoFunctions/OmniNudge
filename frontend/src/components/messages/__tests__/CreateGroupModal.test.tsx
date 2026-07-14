import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateGroupModal } from '../CreateGroupModal';

const {
  mockCreateGroup,
  mockUploadMedia,
} = vi.hoisted(() => ({
  mockCreateGroup: vi.fn(),
  mockUploadMedia: vi.fn(),
}));

vi.mock('../../../services/groupsService', () => ({
  groupsService: {
    createGroup: (...args: unknown[]) => mockCreateGroup(...args),
  },
}));

vi.mock('../../../services/mediaService', () => ({
  mediaService: {
    uploadMedia: (...args: unknown[]) => mockUploadMedia(...args),
  },
}));

vi.mock('../../../utils/mediaUrl', () => ({
  resolveMediaUrl: (value?: string) => value,
}));

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateGroupModal
        onClose={vi.fn()}
        onCreated={vi.fn()}
        searchUsers={async () => [
          {
            id: 12,
            username: 'friend',
            avatar_url: null,
          },
        ]}
      />
    </QueryClientProvider>
  );
}

describe('CreateGroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadMedia.mockResolvedValue({
      storage_url: '/uploads/group-avatar.png',
      storage_path: 'uploads/group-avatar.png',
    });
    mockCreateGroup.mockResolvedValue({
      id: 50,
      conversation_type: 'group',
      is_group: true,
    });
  });

  it('uploads a group avatar and includes the uploaded path in the create payload', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/group name/i), {
      target: { value: 'Launch group' },
    });

    const avatarInput = document.getElementById('create-group-avatar-file') as HTMLInputElement;
    const avatarFile = new File(['avatar'], 'group.png', { type: 'image/png' });
    fireEvent.change(avatarInput, { target: { files: [avatarFile] } });

    await waitFor(() => {
      expect(mockUploadMedia).toHaveBeenCalledWith(avatarFile);
      expect(screen.getByAltText('Avatar Image (optional)')).toHaveAttribute(
        'src',
        '/uploads/group-avatar.png'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByPlaceholderText(/search users/i), {
      target: { value: 'friend' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /friend/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(mockCreateGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Launch group',
          participant_ids: [12],
          avatar_url: '/uploads/group-avatar.png',
        })
      );
    });
  });
});
