import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditProfileModal from '../../src/components/profile/EditProfileModal';

vi.mock('../../src/components/profile/ImageCropModal', () => ({
  default: ({ onConfirm }: { onConfirm: (file: File) => void }) => (
    <button
      type="button"
      onClick={() => onConfirm(new File(['cropped-avatar'], 'crop.jpg', { type: 'image/jpeg' }))}
    >
      Apply crop
    </button>
  ),
}));

describe('EditProfileModal', () => {
  it('submits trimmed bio and preserves the existing avatar image', async () => {
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

    const status = screen.getByLabelText('Status text');
    await userEvent.clear(status);
    await userEvent.type(status, '  Building things  ');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        bio: 'Updated bio',
        avatar_url: 'https://example.com/old.png',
        status_text: 'Building things',
        banner_url: null,
        location: null,
      });
    });
  });

  it('does not render an editable avatar image path field', () => {
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

    expect(screen.getByText('Avatar Image')).toBeInTheDocument();
    expect(screen.queryByLabelText('Avatar URL')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('ftp://invalid-url')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the avatar image with the remove button', async () => {
    const onSave = vi.fn(async () => {});

    render(
      <EditProfileModal
        isOpen
        onClose={() => {}}
        onSave={onSave}
        onUploadAvatar={async () => '/uploads/avatars/new-avatar_sq200.png'}
        initialBio=""
        initialAvatarUrl="/uploads/avatars/current.png"
        initialStatusText=""
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        bio: null,
        avatar_url: null,
        status_text: null,
        banner_url: null,
        location: null,
      });
    });
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

  it('uploads avatar file and updates the avatar image preview', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    await waitFor(() => {
      expect(onUploadAvatar).toHaveBeenCalledWith(expect.any(File));
    });
    await waitFor(() => {
      expect(screen.getByAltText('Avatar Image')).toHaveAttribute('src', '/uploads/avatars/new-avatar_sq200.png');
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
    await userEvent.click(screen.getByRole('button', { name: 'Apply crop' }));

    expect(await screen.findByText('Failed to upload avatar: network down')).toBeInTheDocument();
  });
});
