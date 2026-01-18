import { useState } from 'react';

export function usePostSearch() {
  const [postSearchInput, setPostSearchInput] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [limitSearchToContext, setLimitSearchToContext] = useState(true);
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);

  return {
    // State
    postSearchInput,
    isSearchDropdownOpen,
    limitSearchToContext,
    includeNsfwSearch,

    // Setters
    setPostSearchInput,
    setIsSearchDropdownOpen,
    setLimitSearchToContext,
    setIncludeNsfwSearch,
  };
}
