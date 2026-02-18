import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditProfileModal from '../../src/components/profile/EditProfileModal';

describe('EditProfileModal', () => {
  it('submits trimmed bio and avatar URL', async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();

    render(
      <EditProfileModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        initialBio="Old bio"
        initialAvatarUrl="https://example.com/old.png"
        initialStatusText="Old status"
      />
    );

    const bio = screen.getByLabelText('Bio');
    await userEvent.clear(bio);
    await userEvent.type(bio, '  Updated bio  ');

    const avatarUrl = screen.getByLabelText('Avatar URL');
    await userEvent.clear(avatarUrl);
    await userEvent.type(avatarUrl, '  https://example.com/new.png  ');

    const status = screen.getByLabelText('Status text');
    await userEvent.clear(status);
    await userEvent.type(status, '  Building things  ');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        bio: 'Updated bio',
        avatar_url: 'https://example.com/new.png',
        status_text: 'Building things',
      });
    });
  });

  it('shows validation error for invalid avatar URL', async () => {
    const onSave = vi.fn(async () => {});

    render(
      <EditProfileModal
        isOpen
        onClose={() => {}}
        onSave={onSave}
        initialBio=""
        initialAvatarUrl=""
        initialStatusText=""
      />
    );

    const avatarUrl = screen.getByLabelText('Avatar URL');
    await userEvent.type(avatarUrl, 'ftp://invalid-url');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Avatar URL must start with http:// or https://')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();

    render(
      <EditProfileModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        initialBio=""
        initialAvatarUrl=""
        initialStatusText=""
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uploads avatar file and updates avatar URL field', async () => {
    const onUploadAvatar = vi.fn(async () => '/uploads/avatars/new-avatar_sq200.png');

    render(
      <EditProfileModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        onUploadAvatar={onUploadAvatar}
        initialBio=""
        initialAvatarUrl=""
        initialStatusText=""
      />
    );

    const fileInput = document.getElementById('edit-profile-avatar-file') as HTMLInputElement;
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(onUploadAvatar).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Avatar URL')).toHaveValue('/uploads/avatars/new-avatar_sq200.png');
    });
  });

  it('shows upload error when avatar upload fails', async () => {
    const onUploadAvatar = vi.fn(async () => {
      throw new Error('network down');
    });

    render(
      <EditProfileModal
        isOpen
        onClose={() => {}}
        onSave={async () => {}}
        onUploadAvatar={onUploadAvatar}
        initialBio=""
        initialAvatarUrl=""
        initialStatusText=""
      />
    );

    const fileInput = document.getElementById('edit-profile-avatar-file') as HTMLInputElement;
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    await userEvent.upload(fileInput, file);

    expect(await screen.findByText('Failed to upload avatar: network down')).toBeInTheDocument();
  });
});
