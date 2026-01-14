import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { postsService } from '../services/postsService';
import { hubsService, type Hub } from '../services/hubsService';
import { redditService } from '../services/redditService';
import { hubSettingsService } from '../services/hubSettingsService';
import { mediaService } from '../services/mediaService';
import type { CreatePostRequest, GalleryImage } from '../types/posts';
import type { SubredditSuggestion } from '../types/reddit';
import type { HubSettings } from '../types/hubSettings';
import { getPostUrl } from '../utils/postUrl';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';

const HUB_AUTOCOMPLETE_MIN_LENGTH = 2;
const SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH = 2;

export default function CreatePostPage() {
  const navigate = useNavigate();
  const location = useLocation();

  console.log('[CreatePostPage] Component rendering, location:', location);
  console.log('[CreatePostPage] location.state:', location.state);

  const [activeTab, setActiveTab] = useState<'link' | 'text'>('link');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<string | undefined>(undefined);
  const [mediaItems, setMediaItems] = useState<GalleryImage[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const mediaPreviewsRef = useRef<string[]>([]);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [destination, setDestination] = useState<'hub' | 'subreddit'>('hub');
  const [selectedHub, setSelectedHub] = useState<{ id?: number; name?: string } | null>(null);
  const [hubInputValue, setHubInputValue] = useState<string>('');
  const [isHubAutocompleteOpen, setIsHubAutocompleteOpen] = useState(false);
  const [subredditInputValue, setSubredditInputValue] = useState<string>('');
  const [isSubredditAutocompleteOpen, setIsSubredditAutocompleteOpen] = useState(false);
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  // Pre-fill destination from location state
  useEffect(() => {
    let isMounted = true;
    const state = location.state as { defaultHub?: string; defaultSubreddit?: string } | null;

    console.log('[useEffect] Running with location.state:', state);

    if (state?.defaultHub) {
      const hubName = state.defaultHub;
      console.log('[useEffect] Setting hub destination with hubName:', hubName);
      setDestination('hub');
      setHubInputValue(hubName);
      (async () => {
        try {
          console.log('[useEffect] Fetching hub:', hubName);
          const hub = await hubsService.getHub(hubName);
          console.log('[useEffect] Hub fetched:', hub);
          if (isMounted) {
            console.log('[useEffect] Setting selectedHub to:', { id: hub.id, name: hub.name });
            setSelectedHub({ id: hub.id, name: hub.name });
            setHubInputValue(hub.name);
          } else {
            console.log('[useEffect] Component unmounted, skipping state update');
          }
        } catch (error) {
          console.error('[useEffect] Error fetching hub:', error);
          if (isMounted) {
            setSelectedHub(null);
          }
        }
      })();
    } else if (state?.defaultSubreddit) {
      setDestination('subreddit');
      setSubredditInputValue(state.defaultSubreddit);
    } else {
      console.log('[useEffect] No defaultHub or defaultSubreddit in state');
    }

    return () => {
      console.log('[useEffect] Cleanup - setting isMounted = false');
      isMounted = false;
    };
  }, [location.state]);

  const trimmedHubInput = (hubInputValue ?? '').trim();
  const trimmedSubredditInput = (subredditInputValue ?? '').trim();
  const selectedHubName = destination === 'hub' ? selectedHub?.name ?? '' : '';

  const {
    data: hubSuggestions = [],
    isFetching: isHubAutocompleteLoading,
  } = useQuery<Hub[]>({
    queryKey: ['hub-autocomplete', trimmedHubInput],
    queryFn: () => hubsService.searchHubs(trimmedHubInput),
    enabled:
      destination === 'hub' &&
      isHubAutocompleteOpen &&
      trimmedHubInput.length >= HUB_AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: subredditSuggestions = [],
    isFetching: isSubredditAutocompleteLoading,
  } = useQuery<SubredditSuggestion[]>({
    queryKey: ['subreddit-autocomplete', trimmedSubredditInput],
    queryFn: () => redditService.autocompleteSubreddits(trimmedSubredditInput),
    enabled:
      destination === 'subreddit' &&
      isSubredditAutocompleteOpen &&
      trimmedSubredditInput.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 1000 * 60 * 5,
  });

  const { data: hubSettings } = useQuery<HubSettings>({
    queryKey: ['hub-settings', selectedHubName],
    queryFn: () => hubSettingsService.getHubSettings(selectedHubName),
    enabled: destination === 'hub' && Boolean(selectedHubName),
    staleTime: 1000 * 60 * 5,
  });

  const allowTextPosts =
    destination !== 'hub' || !hubSettings ? true : hubSettings.allow_text_posts;
  const allowLinkPosts =
    destination !== 'hub' || !hubSettings ? true : hubSettings.allow_link_posts;
  const allowImagePosts =
    destination !== 'hub' || !hubSettings ? true : hubSettings.allow_image_posts;
  const allowVideoPosts =
    destination !== 'hub' || !hubSettings ? true : hubSettings.allow_video_posts;
  const allowLinkTab = allowLinkPosts || allowImagePosts || allowVideoPosts;
  const mediaLabel =
    allowImagePosts && allowVideoPosts
      ? 'Images/Videos'
      : allowImagePosts
        ? 'Images'
        : allowVideoPosts
          ? 'Videos'
          : 'Media';
  const mediaAccept =
    allowImagePosts && allowVideoPosts
      ? 'image/*,video/*'
      : allowImagePosts
        ? 'image/*'
        : allowVideoPosts
          ? 'video/*'
          : undefined;

  useEffect(() => {
    if (destination !== 'hub' || !hubSettings) {
      return;
    }

    if (activeTab === 'link' && !allowLinkTab && allowTextPosts) {
      setActiveTab('text');
    } else if (activeTab === 'text' && !allowTextPosts && allowLinkTab) {
      setActiveTab('link');
    }
  }, [activeTab, allowLinkTab, allowTextPosts, destination, hubSettings]);

  const handleSelectHubSuggestion = (hub: Hub) => {
    setSelectedHub({ id: hub.id, name: hub.name });
    setHubInputValue(hub.name);
    setIsHubAutocompleteOpen(false);
  };

  const handleSelectSubredditSuggestion = (name: string) => {
    setSubredditInputValue(name);
    setIsSubredditAutocompleteOpen(false);
  };

  useEffect(() => {
    mediaPreviewsRef.current = mediaPreviews;
  }, [mediaPreviews]);

  useEffect(() => {
    return () => {
      mediaPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (destination !== 'hub' || !hubSettings) {
      return;
    }
    if (!allowLinkPosts && mediaUrl) {
      setMediaUrl('');
      setMediaType(undefined);
    }
  }, [allowLinkPosts, destination, hubSettings, mediaUrl]);

  const normalizeUploadedMediaUrl = (storageUrl?: string, storagePath?: string) => {
    if (storageUrl) {
      if (storageUrl.startsWith('http')) {
        const urlObj = new URL(storageUrl);
        return urlObj.pathname;
      }
      return storageUrl.startsWith('/') ? storageUrl : `/${storageUrl}`;
    }
    if (storagePath) {
      const normalizedPath = storagePath.replace(/^\/?uploads\/?/, '');
      return `/uploads/${normalizedPath}`;
    }
    return '';
  };

  const handleMediaFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const allowImageUploads = allowImagePosts;
    const allowVideoUploads = allowVideoPosts;
    if (!allowImageUploads && !allowVideoUploads) {
      setMediaUploadError('Media uploads are disabled for this hub.');
      return;
    }
    const allowedLabel =
      allowImageUploads && allowVideoUploads
        ? 'image or video files'
        : allowImageUploads
          ? 'image files'
          : allowVideoUploads
            ? 'video files'
            : 'media files';

    const validFiles = files.filter(
      (file) =>
        (allowImageUploads && file.type.startsWith('image/')) ||
        (allowVideoUploads && file.type.startsWith('video/'))
    );
    if (validFiles.length === 0) {
      setMediaUploadError(`Please choose ${allowedLabel}.`);
      return;
    }

    setMediaUploadError(null);
    setIsUploadingMedia(true);
    const pendingItems = validFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      return { previewUrl, file };
    });

    try {
      // Use batch upload for multiple files
      const result = await mediaService.batchUploadMedia(validFiles);

      const uploads: GalleryImage[] = [];
      const previews: string[] = [];

      // Process successful uploads
      result.uploads.forEach((uploaded, index) => {
        if (uploaded) {
          const normalizedUrl = normalizeUploadedMediaUrl(
            uploaded.storage_url,
            uploaded.storage_path
          );
          uploads.push({
            url: normalizedUrl,
            media_type: uploaded.file_type || validFiles[index].type,
            thumbnail_url: uploaded.thumbnail_url,
          });
          previews.push(pendingItems[index].previewUrl);
        } else {
          // Revoke preview URL for failed uploads
          URL.revokeObjectURL(pendingItems[index].previewUrl);
        }
      });

      if (uploads.length > 0) {
        setMediaItems((prev) => [...prev, ...uploads]);
        setMediaPreviews((prev) => [...prev, ...previews]);
      }

      if (uploads.length > 1 || mediaItems.length > 0) {
        setMediaUrl('');
        setMediaType(undefined);
      } else if (uploads.length === 1) {
        setMediaUrl(uploads[0].url);
        setMediaType(uploads[0].media_type);
      }

      // Show error if some uploads failed
      if (result.errors && result.errors.length > 0) {
        setMediaUploadError(`${result.errors.length} file(s) failed to upload`);
      }
    } catch (error) {
      console.error('[CreatePostPage] Failed to upload media:', error);
      setMediaUploadError('Failed to upload media. Please try again.');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleMediaInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void handleMediaFiles(files);
    }
  };

  const handleMediaDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploadingMedia) return;
    event.dataTransfer.dropEffect = 'copy';
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      void handleMediaFiles(files);
    }
  };

  const clearMediaSelection = () => {
    setMediaUrl('');
    setMediaType(undefined);
    setMediaItems([]);
    setMediaUploadError(null);
    mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
    setMediaPreviews([]);
    if (mediaInputRef.current) {
      mediaInputRef.current.value = '';
    }
  };

  const removeMediaItem = (index: number) => {
    setMediaItems((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        setMediaUrl('');
        setMediaType(undefined);
      }
      return next;
    });
    setMediaPreviews((prev) => {
      const toRemove = prev[index];
      if (toRemove) {
        URL.revokeObjectURL(toRemove);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const createPostMutation = useMutation({
    mutationFn: (data: CreatePostRequest) => postsService.createPost(data),
    onSuccess: (post) => {
      navigate(getPostUrl(post));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    if (isUploadingMedia) {
      alert('Please wait for the media upload to finish.');
      return;
    }

    let hubId: number | undefined;
    if (destination === 'hub') {
      console.log('Submit - selectedHub:', selectedHub);
      console.log('Submit - hubInputValue:', hubInputValue);
      console.log('Submit - trimmedHubInput:', trimmedHubInput);

      // If we already have a selected hub with ID, use it directly
      if (selectedHub?.id && selectedHub?.name) {
        console.log('Using selectedHub ID:', selectedHub.id);
        hubId = selectedHub.id;
      } else {
        console.log('Falling back to input validation');
        // Fall back to text input validation
        let normalizedHubInput = trimmedHubInput;

        if (!normalizedHubInput && selectedHub?.name) {
          normalizedHubInput = selectedHub.name;
          setHubInputValue(selectedHub.name);
        }

        if (!normalizedHubInput) {
          console.log('ERROR: normalizedHubInput is empty!');
          alert('Please enter a hub name');
          return;
        }

        try {
          const hub = await hubsService.getHub(normalizedHubInput);
          hubId = hub.id;
          setSelectedHub({ id: hub.id, name: hub.name });
          setHubInputValue(hub.name);
        } catch {
          alert('Please select a valid hub from the suggestions');
          return;
        }
      }
    }

    let targetSubreddit: string | undefined;
    if (destination === 'subreddit') {
      if (!trimmedSubredditInput) {
        alert('Please enter a subreddit');
        return;
      }
      targetSubreddit = trimmedSubredditInput.replace(/^r\//i, '');
    }

    if (destination === 'hub' && hubSettings) {
      if (activeTab === 'text' && !allowTextPosts) {
        alert('This hub does not allow text posts.');
        return;
      }

      if (activeTab === 'link') {
        if (!allowLinkTab) {
          alert('This hub does not allow link or media posts.');
          return;
        }

        const hasMediaItems = mediaItems.length > 0;
        if (!allowLinkPosts && !hasMediaItems) {
          alert('This hub does not allow link posts. Upload an image or video instead.');
          return;
        }

        if (hasMediaItems) {
          const hasImage = mediaItems.some((item) => (item.media_type ?? '').startsWith('image/'));
          const hasVideo = mediaItems.some((item) => (item.media_type ?? '').startsWith('video/'));
          if ((hasImage && !allowImagePosts) || (hasVideo && !allowVideoPosts)) {
            alert('This hub does not allow the selected media type.');
            return;
          }
        }
      }
    }

    const galleryImages = mediaItems.length > 1 ? mediaItems : undefined;
    const singleMediaUrl =
      mediaItems.length === 1 ? mediaItems[0].url : mediaUrl || undefined;
    const primaryItem = mediaItems[0];
    const primaryIsVideo = primaryItem?.media_type?.startsWith('video');
    const thumbnailUrl = primaryItem
      ? primaryIsVideo
        ? primaryItem.thumbnail_url
        : primaryItem.thumbnail_url || primaryItem.url
      : undefined;

    const data: CreatePostRequest = {
      title,
      body: body || undefined,
      media_url: activeTab === 'link' ? singleMediaUrl : undefined,
      media_type:
        activeTab === 'link'
          ? mediaItems.length === 1
            ? mediaItems[0].media_type
            : mediaType
          : undefined,
      thumbnail_url: activeTab === 'link' ? thumbnailUrl : undefined,
      gallery_images: activeTab === 'link' ? galleryImages : undefined,
      hub_id: destination === 'hub' ? hubId : undefined,
      target_subreddit: destination === 'subreddit' ? targetSubreddit : undefined,
      send_replies_to_inbox: sendRepliesToInbox,
      post_type: activeTab,
    };

    console.log('[CreatePostPage] Submitting post with data:', data);
    console.log('[CreatePostPage] Current destination:', destination);
    console.log('[CreatePostPage] hubId:', hubId);
    console.log('[CreatePostPage] targetSubreddit:', targetSubreddit);

    createPostMutation.mutate(data);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create a Post</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {allowLinkTab && (
          <button
            onClick={() => setActiveTab('link')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'link'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {allowLinkPosts ? 'Link' : 'Media'}
          </button>
        )}
        {allowTextPosts && (
          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'text'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Text
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter post title"
            required
            maxLength={300}
          />
        </div>

        {/* Link Tab Content */}
        {activeTab === 'link' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              {allowLinkPosts ? 'URL or Media' : 'Media'}
            </label>
            {allowLinkPosts && (
              <>
                <input
                  type={mediaItems.length > 0 ? 'text' : 'url'}
                  value={mediaUrl}
                  onChange={(e) => {
                    setMediaUrl(e.target.value);
                    if (e.target.value) {
                      setMediaType(undefined);
                      setMediaItems([]);
                      setMediaUploadError(null);
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                  disabled={mediaItems.length > 0}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Enter a URL or upload an image/video
                </p>
              </>
            )}
            {(allowImagePosts || allowVideoPosts) && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">{mediaLabel}</label>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleMediaDrop}
                  className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center"
                >
                  {mediaItems.length > 0 ? (
                    <>
                      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                        {mediaItems.map((item, index) => {
                          const previewUrl = mediaPreviews[index] ?? item.url;
                          const isVideo = (item.media_type ?? '').startsWith('video');
                          return (
                            <div
                              key={`${item.url}-${index}`}
                              className="flex flex-col items-center gap-2 rounded-md border border-gray-200 bg-white p-3"
                            >
                              {isVideo ? (
                                <video src={previewUrl} controls className="max-h-36 w-full rounded" />
                              ) : (
                                <img
                                  src={previewUrl}
                                  alt="Uploaded preview"
                                  className="max-h-36 w-full rounded object-contain"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => removeMediaItem(index)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                                disabled={isUploadingMedia}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => mediaInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                          disabled={isUploadingMedia}
                        >
                          Add more
                        </button>
                        <button
                          type="button"
                          onClick={clearMediaSelection}
                          className="px-3 py-1.5 rounded-md text-sm text-red-600 hover:text-red-700"
                          disabled={isUploadingMedia}
                        >
                          Clear all
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-gray-500">
                        Drag and drop a file here, or
                      </div>
                      <button
                        type="button"
                        onClick={() => mediaInputRef.current?.click()}
                        className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        disabled={isUploadingMedia}
                      >
                        {isUploadingMedia ? 'Uploading...' : 'Choose File'}
                      </button>
                    </>
                  )}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept={mediaAccept}
                    multiple
                    className="hidden"
                    onChange={handleMediaInputChange}
                    disabled={isUploadingMedia}
                  />
                </div>
                {mediaUploadError && (
                  <p className="mt-2 text-sm text-red-600">{mediaUploadError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Text Tab Content */}
        {activeTab === 'text' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Body (optional, Markdown supported)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={10}
              placeholder="Enter post body (Markdown supported)"
            />
          </div>
        )}

        {/* Destination Selector */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Choose where to post <span className="text-red-500">*</span>
          </label>

          <div className="space-y-3">
            <div className="space-y-2">
              {/* Hub/Subreddit tabs */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDestination('hub')}
                  className={`px-3 py-1 text-sm rounded ${
                    destination === 'hub'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Hubs
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('subreddit')}
                  className={`px-3 py-1 text-sm rounded ${
                    destination === 'subreddit'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Subreddits
                </button>
              </div>

              {/* Hub selector */}
              {destination === 'hub' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Enter a hub</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={hubInputValue || ''}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setHubInputValue(newValue || '');
                        // Only clear selectedHub if the user actually changed the value
                        if (newValue !== selectedHub?.name) {
                          setSelectedHub(null);
                        }
                      }}
                      onFocus={() => setIsHubAutocompleteOpen(true)}
                      onBlur={() => setIsHubAutocompleteOpen(false)}
                      placeholder="Search for a hub..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {isHubAutocompleteOpen &&
                      trimmedHubInput.length >= HUB_AUTOCOMPLETE_MIN_LENGTH && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border bg-white shadow-lg">
                          {isHubAutocompleteLoading ? (
                            <div className="px-3 py-2">
                              <LoadingMessage className="mt-0 text-sm text-gray-500">
                                Searching...
                              </LoadingMessage>
                            </div>
                          ) : hubSuggestions.length === 0 ? (
                            <div className="px-3 py-2">
                              <EmptyMessage className="mt-0 text-sm text-gray-500">
                                No hubs found.
                              </EmptyMessage>
                            </div>
                          ) : (
                            <ul>
                              {hubSuggestions.map((hub) => (
                                <li key={hub.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSelectHubSuggestion(hub)}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        h/{hub.name}
                                      </p>
                                      {hub.title && (
                                        <p className="text-xs text-gray-500 truncate">{hub.title}</p>
                                      )}
                                    </div>
                                    {typeof hub.subscriber_count === 'number' && (
                                      <span className="text-xs text-gray-500">
                                        {hub.subscriber_count.toLocaleString()} subs
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Subreddit selector */}
              {destination === 'subreddit' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Enter a subreddit</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={subredditInputValue}
                      onChange={(e) => setSubredditInputValue(e.target.value)}
                      onFocus={() => setIsSubredditAutocompleteOpen(true)}
                      onBlur={() => setIsSubredditAutocompleteOpen(false)}
                      placeholder="Search for a subreddit..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {isSubredditAutocompleteOpen &&
                      trimmedSubredditInput.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border bg-white shadow-lg">
                          {isSubredditAutocompleteLoading ? (
                            <div className="px-3 py-2">
                              <LoadingMessage className="mt-0 text-sm text-gray-500">
                                Searching...
                              </LoadingMessage>
                            </div>
                          ) : subredditSuggestions.length === 0 ? (
                            <div className="px-3 py-2">
                              <EmptyMessage className="mt-0 text-sm text-gray-500">
                                No subreddits found.
                              </EmptyMessage>
                            </div>
                          ) : (
                            <ul>
                              {subredditSuggestions.map((suggestion) => (
                                <li key={suggestion.name}>
                                  <button
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSelectSubredditSuggestion(suggestion.name)}
                                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                                  >
                                    {suggestion.icon_url ? (
                                      <img
                                        src={suggestion.icon_url}
                                        alt=""
                                        className="h-6 w-6 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-600">
                                        r/
                                      </div>
                                    )}
                                    <div className="flex min-w-0 flex-col">
                                      <span className="truncate text-sm font-medium text-gray-900">
                                        r/{suggestion.name}
                                      </span>
                                      {suggestion.title && (
                                        <span className="truncate text-xs text-gray-500">
                                          {suggestion.title}
                                        </span>
                                      )}
                                    </div>
                                    {typeof suggestion.subscribers === 'number' &&
                                      suggestion.subscribers > 0 && (
                                        <span className="ml-auto text-xs text-gray-500">
                                          {suggestion.subscribers.toLocaleString()} subs
                                        </span>
                                      )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Send Replies to Inbox */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={sendRepliesToInbox}
              onChange={(e) => setSendRepliesToInbox(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Send replies to my inbox</span>
          </label>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={createPostMutation.isPending || isUploadingMedia}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {createPostMutation.isPending ? 'Creating...' : 'Create Post'}
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

        {createPostMutation.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">
              Error: {(createPostMutation.error as Error).message}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
