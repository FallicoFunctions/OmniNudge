import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { hubsService, type CreateHubRequest } from '../services/hubsService';
import { MarkdownInput } from '../components/common/MarkdownInput';
import { FieldError, FormError } from '../components/common/ErrorStates';
import { FormField } from '../components/forms/FormField';

export default function CreateHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [allowAllPosts, setAllowAllPosts] = useState(true);
  const [allowTextPosts, setAllowTextPosts] = useState(false);
  const [allowLinkPosts, setAllowLinkPosts] = useState(false);
  const [allowImagePosts, setAllowImagePosts] = useState(false);
  const [allowVideoPosts, setAllowVideoPosts] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const [nameError, setNameError] = useState('');
  const [contentError, setContentError] = useState('');

  const createHubMutation = useMutation({
    mutationFn: (data: CreateHubRequest) => hubsService.createHub(data),
    onSuccess: (hub) => {
      navigate(`/h/${hub.name}`);
    },
  });

  const validateName = (value: string): boolean => {
    setName(value.toLowerCase());

    if (value.length < 3) {
      setNameError('Name must be at least 3 characters');
      return false;
    }
    if (value.length > 100) {
      setNameError('Name must be less than 100 characters');
      return false;
    }
    if (!/^[a-z0-9_]+$/.test(value)) {
      setNameError('Name must be lowercase letters, numbers, and underscores only (no spaces)');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateName(name)) {
      return;
    }

    if (description.length > 10000) {
      alert('Description must be less than 10,000 characters');
      return;
    }

    if (!allowAllPosts && !allowTextPosts && !allowLinkPosts && !allowImagePosts && !allowVideoPosts) {
      setContentError('Select at least one post type.');
      return;
    }

    setContentError('');
    const allowAll =
      allowAllPosts || (allowTextPosts && allowLinkPosts && allowImagePosts && allowVideoPosts);
    const data: CreateHubRequest = {
      name,
      title: title || undefined,
      description: description || undefined,
      type,
      content_options: allowAll ? 'any' : 'custom',
      allow_text_posts: allowAll ? true : allowTextPosts,
      allow_link_posts: allowAll ? true : allowLinkPosts,
      allow_image_posts: allowAll ? true : allowImagePosts,
      allow_video_posts: allowAll ? true : allowVideoPosts,
      nsfw: isNsfw || undefined,
    };

    createHubMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create a Hub</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section: Basic Information */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-xl font-semibold mb-2 text-[var(--color-text-primary)]">Basic Information</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Set up your hub's name and description. The name cannot be changed later.
          </p>

          <div className="space-y-6">
            {/* Name */}
            <FormField
              label="Name"
              required={true}
              error={nameError}
              helperText="No spaces allowed. Use lowercase letters, numbers, and underscores. Once chosen, this cannot be changed."
            >
              <div className="relative">
                <input
                  id="hub-name"
                  type="text"
                  value={name}
                  onChange={(e) => validateName(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] focus:ring-2 focus:outline-none ${
                    nameError
                      ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      : name.length >= 3
                      ? 'border-green-300 focus:ring-green-500 focus:border-green-500'
                      : 'border-[var(--color-border)] focus:ring-[var(--color-primary)]'
                  }`}
                  placeholder="e.g., books or bookclub"
                  required
                  aria-invalid={nameError ? 'true' : 'false'}
                  aria-describedby={nameError ? 'name-error' : undefined}
                />
                {/* Success indicator */}
                {!nameError && name.length >= 3 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </FormField>

            {/* Title */}
            <FormField
              label="Title"
              required={false}
              helperText="Display title for your hub"
            >
              <input
                id="hub-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                placeholder="e.g., Books: Made from trees or pixels"
                maxLength={500}
              />
            </FormField>

            {/* Description */}
            <MarkdownInput
              label="About (optional, Markdown supported)"
              value={description}
              onChange={setDescription}
              rows={6}
              maxLength={10000}
              placeholder="Describe your hub..."
              helperText={`${description.length}/10,000 characters. Appears in search results and social media links.`}
            />
          </div>
        </div>

        {/* Section: Privacy & Visibility */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-xl font-semibold mb-2 text-[var(--color-text-primary)]">Privacy & Visibility</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Control who can access your hub and whether it contains adult content.
          </p>

          <div className="space-y-6">
            {/* Type */}
            <div>
              <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
                Type <span className="text-red-500 ml-1">*</span>
              </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="public"
                checked={type === 'public'}
                onChange={(e) => setType(e.target.value as 'public')}
                className="mr-2"
              />
              <span className="font-medium">Public</span>
              <span className="ml-2 text-sm text-gray-600">
                - Anyone can view and submit
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="private"
                checked={type === 'private'}
                onChange={(e) => setType(e.target.value as 'private')}
                className="mr-2"
              />
              <span className="font-medium">Private</span>
              <span className="ml-2 text-sm text-gray-600">
                - Only approved members can view and submit
              </span>
            </label>
              </div>
            </div>

            {/* NSFW */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNsfw}
                  onChange={(e) => setIsNsfw(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                />
                <div>
                  <span className="font-medium text-[var(--color-text-primary)]">Mark as NSFW (18+)</span>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    This hub contains adult content and should only be viewed by users 18 years or older.
                    NSFW hubs are hidden from default feeds and search results unless users explicitly opt-in.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Section: Content Rules */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-xl font-semibold mb-2 text-[var(--color-text-primary)]">Content Rules</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Choose what types of posts are allowed in your hub.
          </p>

          {/* Content Options */}
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
              Allowed Post Types <span className="text-red-500 ml-1">*</span>
            </label>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={allowAllPosts}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllowAllPosts(checked);
                  if (checked) {
                    setAllowTextPosts(false);
                    setAllowLinkPosts(false);
                    setAllowImagePosts(false);
                    setAllowVideoPosts(false);
                  }
                  setContentError('');
                }}
                className="mr-2"
              />
              <span className="font-medium">All</span>
              <span className="ml-2 text-sm text-gray-600">
                - Text, links, images, and videos allowed
              </span>
            </label>
            <div className="ml-7 text-sm text-gray-500">or</div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={allowLinkPosts}
                onChange={(e) => {
                  setAllowLinkPosts(e.target.checked);
                  if (e.target.checked) {
                    setAllowAllPosts(false);
                  }
                  setContentError('');
                }}
                className="mr-2"
              />
              <span className="font-medium">Links</span>
              <span className="ml-2 text-sm text-gray-600">
                - External link posts allowed
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={allowTextPosts}
                onChange={(e) => {
                  setAllowTextPosts(e.target.checked);
                  if (e.target.checked) {
                    setAllowAllPosts(false);
                  }
                  setContentError('');
                }}
                className="mr-2"
              />
              <span className="font-medium">Text</span>
              <span className="ml-2 text-sm text-gray-600">
                - Text posts allowed
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={allowImagePosts}
                onChange={(e) => {
                  setAllowImagePosts(e.target.checked);
                  if (e.target.checked) {
                    setAllowAllPosts(false);
                  }
                  setContentError('');
                }}
                className="mr-2"
              />
              <span className="font-medium">Images</span>
              <span className="ml-2 text-sm text-gray-600">
                - Image and gallery posts allowed
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={allowVideoPosts}
                onChange={(e) => {
                  setAllowVideoPosts(e.target.checked);
                  if (e.target.checked) {
                    setAllowAllPosts(false);
                  }
                  setContentError('');
                }}
                className="mr-2"
              />
              <span className="font-medium">Videos</span>
              <span className="ml-2 text-sm text-gray-600">
                - Video posts allowed
              </span>
            </label>
            </div>
            {contentError && <FieldError message={contentError} />}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={createHubMutation.isPending || !!nameError || !name}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {createHubMutation.isPending ? 'Creating...' : 'Create Hub'}
          </button>
          <button
            type="button"
            onClick={() => {
              const state = location.state as { returnTo?: string } | null;
              if (state?.returnTo) {
                navigate(state.returnTo);
              } else {
                navigate(-1);
              }
            }}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {createHubMutation.isError && (
          <FormError
            title="Failed to create hub"
            message={(createHubMutation.error as Error).message}
          />
        )}
      </form>
    </div>
  );
}
