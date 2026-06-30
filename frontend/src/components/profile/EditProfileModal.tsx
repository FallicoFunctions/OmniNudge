import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ImageCropModal from './ImageCropModal';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    bio?: string | null;
    avatar_url?: string | null;
    status_text?: string | null;
    banner_url?: string | null;
    location?: string | null;
  }) => Promise<void>;
  initialBio?: string | null;
  initialAvatarUrl?: string | null;
  initialStatusText?: string | null;
  initialBannerUrl?: string | null;
  initialLocation?: string | null;
  onUploadAvatar?: (file: File) => Promise<string>;
  onUploadBanner?: (file: File) => Promise<string>;
  isSaving?: boolean;
}

export default function EditProfileModal({
  isOpen,
  onClose,
  onSave,
  initialBio,
  initialAvatarUrl,
  initialStatusText,
  initialBannerUrl,
  initialLocation,
  onUploadAvatar,
  onUploadBanner,
  isSaving = false,
}: EditProfileModalProps) {
  const { t } = useTranslation();
  const [bio, setBio] = useState(initialBio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [statusText, setStatusText] = useState(initialStatusText ?? '');
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl ?? '');
  const [location, setLocation] = useState(initialLocation ?? '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crop modal state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner' | null>(null);
  const pendingUploadRef = useRef<((file: File) => Promise<string>) | null>(null);
  const cropObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBio(initialBio ?? '');
    setAvatarUrl(initialAvatarUrl ?? '');
    setStatusText(initialStatusText ?? '');
    setBannerUrl(initialBannerUrl ?? '');
    setLocation(initialLocation ?? '');
    setError(null);
  }, [initialAvatarUrl, initialBio, initialStatusText, initialBannerUrl, initialLocation, isOpen]);

  if (!isOpen) return null;

  const openCropModal = (
    file: File,
    type: 'avatar' | 'banner',
    uploadFn: (f: File) => Promise<string>,
    inputEl: HTMLInputElement,
  ) => {
    if (cropObjectUrl.current) URL.revokeObjectURL(cropObjectUrl.current);
    const url = URL.createObjectURL(file);
    cropObjectUrl.current = url;
    pendingUploadRef.current = uploadFn;
    setCropType(type);
    setCropSrc(url);
    inputEl.value = '';
  };

  const handleCropConfirm = async (croppedFile: File) => {
    if (!pendingUploadRef.current || !cropType) return;
    const uploadFn = pendingUploadRef.current;
    const type = cropType;
    closeCropModal();

    if (type === 'avatar') setIsUploadingAvatar(true);
    else setIsUploadingBanner(true);
    setError(null);
    try {
      const url = await uploadFn(croppedFile);
      if (type === 'avatar') setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (err) {
      setError(
        t('userProfilePage.edit.errors.uploadFailed', {
          message: err instanceof Error ? err.message : t('common.error'),
        }),
      );
    } finally {
      if (type === 'avatar') setIsUploadingAvatar(false);
      else setIsUploadingBanner(false);
    }
  };

  const closeCropModal = () => {
    setCropSrc(null);
    setCropType(null);
    pendingUploadRef.current = null;
    if (cropObjectUrl.current) {
      URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = null;
    }
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadAvatar) return;
    openCropModal(file, 'avatar', onUploadAvatar, event.target);
  };

  const handleBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadBanner) return;
    openCropModal(file, 'banner', onUploadBanner, event.target);
  };

  const handleSave = async () => {
    const trimmedBio = bio.trim();
    const trimmedAvatarUrl = avatarUrl.trim();
    const trimmedStatusText = statusText.trim();
    const trimmedBannerUrl = bannerUrl.trim();
    const trimmedLocation = location.trim();

    if (trimmedBio.length > 500) {
      setError(t('userProfilePage.edit.errors.bioTooLong'));
      return;
    }
    if (trimmedStatusText.length > 500) {
      setError(t('userProfilePage.edit.errors.statusTooLong'));
      return;
    }
    if (trimmedLocation.length > 100) {
      setError(t('userProfilePage.edit.errors.locationTooLong'));
      return;
    }
    if (
      trimmedAvatarUrl &&
      !trimmedAvatarUrl.startsWith('http://') &&
      !trimmedAvatarUrl.startsWith('https://') &&
      !trimmedAvatarUrl.startsWith('/')  // allow server-relative paths from file uploads
    ) {
      setError(t('userProfilePage.edit.errors.invalidAvatarUrl'));
      return;
    }
    if (
      trimmedBannerUrl &&
      !trimmedBannerUrl.startsWith('http://') &&
      !trimmedBannerUrl.startsWith('https://') &&
      !trimmedBannerUrl.startsWith('/uploads/banners/')
    ) {
      setError('Banner URL must start with http:// or https://');
      return;
    }

    setError(null);
    await onSave({
      bio: trimmedBio ? trimmedBio : null,
      avatar_url: trimmedAvatarUrl ? trimmedAvatarUrl : null,
      status_text: trimmedStatusText ? trimmedStatusText : null,
      banner_url: trimmedBannerUrl ? trimmedBannerUrl : null,
      location: trimmedLocation ? trimmedLocation : null,
    });
  };

  return (
    <>
    {cropSrc && cropType && (
      <ImageCropModal
        src={cropSrc}
        aspect={cropType === 'avatar' ? 1 : 3}
        shape={cropType === 'avatar' ? 'circle' : 'rect'}
        outputWidth={cropType === 'avatar' ? 800 : 1500}
        outputHeight={cropType === 'avatar' ? 800 : 500}
        title={cropType === 'avatar' ? 'Crop profile photo' : 'Crop cover photo'}
        onConfirm={(file) => { void handleCropConfirm(file); }}
        onCancel={closeCropModal}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('userProfilePage.edit.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('userProfilePage.edit.description')}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="edit-profile-avatar-url"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.avatarUrlLabel')}
            </label>
            <input
              id="edit-profile-avatar-url"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder={t('userProfilePage.edit.avatarUrlPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            {onUploadAvatar && (
              <div className="mt-2 flex items-center gap-2">
                <label
                  htmlFor="edit-profile-avatar-file"
                  className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {isUploadingAvatar
                    ? t('userProfilePage.edit.avatarUploading')
                    : t('userProfilePage.edit.avatarUploadButton')}
                </label>
                <input
                  id="edit-profile-avatar-file"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  disabled={isUploadingAvatar}
                  onChange={handleAvatarFileChange}
                />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {t('userProfilePage.edit.avatarUploadHint')}
                </span>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="edit-profile-banner-url"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              Cover / Banner Image URL
            </label>
            <input
              id="edit-profile-banner-url"
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            {onUploadBanner && (
              <div className="mt-2 flex items-center gap-2">
                <label
                  htmlFor="edit-profile-banner-file"
                  className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {isUploadingBanner ? 'Uploading…' : 'Upload banner image'}
                </label>
                <input
                  id="edit-profile-banner-file"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  disabled={isUploadingBanner}
                  onChange={handleBannerFileChange}
                />
                <span className="text-xs text-[var(--color-text-secondary)]">PNG, JPG, GIF, WebP · max 10MB</span>
              </div>
            )}
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Shown as the full-width banner behind your profile header.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-profile-status-text"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.statusLabel')}
            </label>
            <input
              id="edit-profile-status-text"
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              maxLength={500}
              placeholder={t('userProfilePage.edit.statusPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('userProfilePage.edit.statusCount', { count: statusText.length })}
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-profile-location"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.locationLabel')}
            </label>
            <input
              id="edit-profile-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              placeholder={t('userProfilePage.edit.locationPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('userProfilePage.edit.locationCount', { count: location.length })}
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-profile-bio"
              className="block text-sm font-medium text-[var(--color-text-primary)]"
            >
              {t('userProfilePage.edit.bioLabel')}
            </label>
            <textarea
              id="edit-profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              maxLength={500}
              placeholder={t('userProfilePage.edit.bioPlaceholder')}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t('userProfilePage.edit.bioCount', { count: bio.length })}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isUploadingAvatar || isUploadingBanner}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || isUploadingAvatar || isUploadingBanner}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : isUploadingAvatar || isUploadingBanner ? t('userProfilePage.edit.avatarUploading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
