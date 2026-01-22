import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { postsService } from '../../services/postsService';
import { mediaService, type MediaFile } from '../../services/mediaService';
import type { CreatePostRequest, GalleryImage } from '../../types/posts';
import { getPostUrl } from '../../utils/postUrl';

interface InlineCreatePostProps {
  feedType: 'hub' | 'subreddit';
  feedSource: string;
  onClose: () => void;
}

export function InlineCreatePost({ feedType, feedSource, onClose }: InlineCreatePostProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'link' | 'text'>('link');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaItems, setMediaItems] = useState<GalleryImage[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [isNsfw, setIsNsfw] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mediaPreviews]);

  const normalizeUploadedMediaUrl = (storageUrl?: string) => {
    if (storageUrl) {
      if (storageUrl.startsWith('http')) {
        const urlObj = new URL(storageUrl);
        return urlObj.pathname;
      }
      return storageUrl.startsWith('/') ? storageUrl : `/${storageUrl}`;
    }
    return '';
  };

  const handleMediaFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setMediaUploadError(null);
    setIsUploadingMedia(true);

    const pendingItems = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      return { previewUrl, file };
    });

    try {
      if (files.length === 1) {
        const response = await mediaService.uploadMedia(files[0]);
        const normalizedUrl = normalizeUploadedMediaUrl(response.storage_url || response.storage_path);
        setMediaUrl(normalizedUrl);
        setMediaItems([
          {
            url: normalizedUrl,
            media_type: files[0].type.startsWith('video/') ? 'video' : 'image',
          },
        ]);
        setMediaPreviews([pendingItems[0].previewUrl]);
      } else {
        const responses = await mediaService.batchUploadMedia(files);
        const successfulUploads = responses.uploads
          .map((upload, index) => (upload ? { upload, index } : null))
          .filter((item): item is { upload: MediaFile; index: number } => Boolean(item));
        const galleryImages: GalleryImage[] = successfulUploads.map(({ upload, index }) => ({
          url: normalizeUploadedMediaUrl(upload.storage_url || upload.storage_path),
          media_type: files[index].type.startsWith('video/') ? 'video' : 'image',
        }));
        setMediaItems(galleryImages);
        setMediaPreviews(successfulUploads.map(({ index }) => pendingItems[index].previewUrl));
      }
    } catch (error) {
      console.error('Failed to upload media:', error);
      setMediaUploadError('Failed to upload media. Please try again.');
      pendingItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const removeMediaItem = (index: number) => {
    const updatedItems = mediaItems.filter((_, i) => i !== index);
    const updatedPreviews = mediaPreviews.filter((_, i) => i !== index);
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaItems(updatedItems);
    setMediaPreviews(updatedPreviews);
    if (updatedItems.length === 0) {
      setMediaUrl('');
    }
  };

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const requestPayload: CreatePostRequest = {
        title: title.trim(),
        body: activeTab === 'text' && body.trim() ? body.trim() : undefined,
        media_url: activeTab === 'link' && mediaUrl ? mediaUrl : undefined,
        gallery_images: activeTab === 'link' && mediaItems.length > 1 ? mediaItems : undefined,
        nsfw: isNsfw,
        send_replies_to_inbox: true,
        post_type: activeTab,
      };

      if (feedType === 'hub') {
        requestPayload.hub_name = feedSource;
      } else {
        requestPayload.subreddit_name = feedSource;
      }

      return postsService.createPost(requestPayload);
    },
    onSuccess: (newPost) => {
      queryClient.invalidateQueries({ queryKey: ['column-feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });

      // Navigate to the new post
      const postUrl = getPostUrl(newPost);
      navigate(postUrl);

      // Close the form
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create post:', error);
      alert('Failed to create post. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    if (activeTab === 'link' && !mediaUrl && mediaItems.length === 0) {
      alert('Please add media or switch to text post');
      return;
    }
    createPostMutation.mutate();
  };

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-cyan-400 font-semibold">
          Create Post in {feedType === 'hub' ? 'h/' : 'r/'}{feedSource}
        </div>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Tab Switcher */}
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`px-3 py-1.5 transition-colors ${
              activeTab === 'link'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Link/Media
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`px-3 py-1.5 transition-colors ${
              activeTab === 'text'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Text
          </button>
        </div>

        {/* Title Input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title..."
          maxLength={300}
          className="w-full px-2 py-1.5 bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder:text-[var(--color-text-muted)]"
        />

        {/* Link Tab Content */}
        {activeTab === 'link' && (
          <div className="space-y-2">
            <input
              ref={mediaInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => e.target.files && handleMediaFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={isUploadingMedia}
              className="w-full px-2 py-1.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
            >
              {isUploadingMedia ? 'Uploading...' : 'Upload Media'}
            </button>

            {mediaUploadError && (
              <div className="text-red-400 text-[10px]">{mediaUploadError}</div>
            )}

            {mediaPreviews.length > 0 && (
              <div className="space-y-1">
                {mediaPreviews.map((preview, index) => (
                  <div key={index} className="flex items-center gap-2 p-1 bg-[var(--color-background)] rounded">
                    <img src={preview} alt="" className="w-8 h-8 object-cover rounded" />
                    <span className="flex-1 truncate text-[var(--color-text-muted)] text-[10px]">
                      {mediaItems[index]?.media_type === 'video' ? 'Video' : 'Image'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMediaItem(index)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Text Tab Content */}
        {activeTab === 'text' && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post body (optional)..."
            rows={6}
            maxLength={10000}
            className="w-full px-2 py-1.5 bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder:text-[var(--color-text-muted)] resize-none"
          />
        )}

        {/* NSFW Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="inline-nsfw"
            checked={isNsfw}
            onChange={(e) => setIsNsfw(e.target.checked)}
            className="w-3 h-3 cursor-pointer accent-cyan-500"
          />
          <label htmlFor="inline-nsfw" className="text-[var(--color-text)] cursor-pointer">
            NSFW (18+)
          </label>
        </div>

        {/* Submit Button */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-1.5 bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded hover:bg-[var(--color-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createPostMutation.isPending || isUploadingMedia || !title.trim()}
            className="flex-1 px-3 py-1.5 bg-cyan-500 text-white rounded hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createPostMutation.isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
