import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { hubsService, type CreateHubRequest } from '../services/hubsService';

export default function CreateHubPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [contentOptions, setContentOptions] = useState<'any' | 'links_only' | 'text_only'>('any');
  const [nameError, setNameError] = useState('');

  const createHubMutation = useMutation({
    mutationFn: (data: CreateHubRequest) => hubsService.createHub(data),
    onSuccess: (hub) => {
      navigate(`/hubs/h/${hub.name}`);
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

    if (description.length > 500) {
      alert('Description must be less than 500 characters');
      return;
    }

    const data: CreateHubRequest = {
      name,
      title: title || undefined,
      description: description || undefined,
      type,
      content_options: contentOptions,
    };

    createHubMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create a Hub</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => validateName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., books or bookclub"
            required
          />
          {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
          <p className="mt-1 text-sm text-gray-500">
            No spaces allowed. Use lowercase letters, numbers, and underscores. Once chosen, this cannot be changed.
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Books: Made from trees or pixels"
            maxLength={500}
          />
          <p className="mt-1 text-sm text-gray-500">
            Display title for your hub (optional)
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={4}
            maxLength={500}
            placeholder="Describe your hub..."
          />
          <p className="mt-1 text-sm text-gray-500">
            {description.length}/500 characters. Appears in search results and social media links.
          </p>
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Type <span className="text-red-500">*</span>
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

        {/* Content Options */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Content Options <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="any"
                checked={contentOptions === 'any'}
                onChange={(e) => setContentOptions(e.target.value as 'any')}
                className="mr-2"
              />
              <span className="font-medium">Any</span>
              <span className="ml-2 text-sm text-gray-600">
                - Links and text posts allowed
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="links_only"
                checked={contentOptions === 'links_only'}
                onChange={(e) => setContentOptions(e.target.value as 'links_only')}
                className="mr-2"
              />
              <span className="font-medium">Links Only</span>
              <span className="ml-2 text-sm text-gray-600">
                - Only link posts allowed
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="text_only"
                checked={contentOptions === 'text_only'}
                onChange={(e) => setContentOptions(e.target.value as 'text_only')}
                className="mr-2"
              />
              <span className="font-medium">Text Only</span>
              <span className="ml-2 text-sm text-gray-600">
                - Only text posts allowed
              </span>
            </label>
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
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {createHubMutation.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">
              Error: {(createHubMutation.error as Error).message}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
