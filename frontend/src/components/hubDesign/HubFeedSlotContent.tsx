import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hubsService } from '../../services/hubsService';
import {
  HubFeedControls,
  StandalonePostFeed,
  type FeedSlotPost,
  type SortOption,
} from './HubDesignSlots';

const EMPTY_POSTS: FeedSlotPost[] = [];

interface HubFeedSlotContentProps {
  hubName: string;
}

export default function HubFeedSlotContent({ hubName }: HubFeedSlotContentProps) {
  const [sort, setSort] = useState<SortOption>('hot');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const handleSearch = useCallback(() => setActiveSearch(search), [search]);

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['hub-ai-posts', hubName, sort],
    queryFn: () => hubsService.getHubPosts(hubName, sort, 25),
  });

  const allPosts: FeedSlotPost[] = postsData?.posts ?? EMPTY_POSTS;
  const filteredPosts = useMemo(() => {
    if (!activeSearch) return allPosts;
    const q = activeSearch.toLowerCase();
    return allPosts.filter((post) => post.title?.toLowerCase().includes(q));
  }, [activeSearch, allPosts]);

  return (
    <div className="hub-slot-feed">
      <HubFeedControls
        sort={sort}
        onSortChange={setSort}
        searchValue={search}
        onSearchChange={setSearch}
        onSearch={handleSearch}
      />
      <StandalonePostFeed posts={filteredPosts} loading={postsLoading} hubName={hubName} />
    </div>
  );
}
