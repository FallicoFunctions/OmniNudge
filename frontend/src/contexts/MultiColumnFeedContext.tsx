import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface ColumnConfig {
  id: string;
  feedType: 'home' | 'subreddit' | 'hub' | 'messages';
  feedSource?: string; // subreddit name or hub name
  sort: 'hot' | 'new' | 'top' | 'rising' | 'controversial';
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  omniOnly?: boolean; // For home feed
  cursorStack: string[]; // For back navigation
  currentCursor: string;
}

export interface MultiColumnFeedState {
  viewMode: 'standard' | 'multi-column' | 'vertical-omniscroll';
  columns: ColumnConfig[];
  activeColumnId: string | null; // Which column mouse is over
  columnCount: number; // 2 or 3
}

export interface MultiColumnFeedContextValue {
  state: MultiColumnFeedState;
  setViewMode: (mode: MultiColumnFeedState['viewMode']) => void;
  setColumnCount: (count: number) => void;
  updateColumnConfig: (columnId: string, config: Partial<ColumnConfig>) => void;
  setActiveColumn: (columnId: string | null) => void;
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  resetColumns: () => void;
}

const MultiColumnFeedContext = createContext<MultiColumnFeedContextValue | null>(null);

const STORAGE_KEY = 'multiColumnFeedState';

function createDefaultColumns(): ColumnConfig[] {
  return [
    {
      id: 'col-1',
      feedType: 'home',
      sort: 'hot',
      timeRange: 'day',
      omniOnly: false,
      cursorStack: [],
      currentCursor: '',
    },
    {
      id: 'col-2',
      feedType: 'home',
      sort: 'hot',
      timeRange: 'day',
      omniOnly: false,
      cursorStack: [],
      currentCursor: '',
    },
    {
      id: 'col-3',
      feedType: 'home',
      sort: 'hot',
      timeRange: 'day',
      omniOnly: false,
      cursorStack: [],
      currentCursor: '',
    },
  ];
}

export function MultiColumnFeedProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MultiColumnFeedState>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate the loaded state
        if (parsed.columns && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
          return {
            viewMode: parsed.viewMode || 'standard',
            columnCount: parsed.columnCount || parsed.columns.length,
            columns: parsed.columns,
            activeColumnId: null, // Don't persist active column
          };
        }
      } catch (e) {
        console.error('Failed to parse saved multi-column state', e);
      }
    }

    // Default: 3 columns with home feed
    return {
      viewMode: 'standard',
      columnCount: 3,
      columns: createDefaultColumns(),
      activeColumnId: null,
    };
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    const stateToPersist = {
      viewMode: state.viewMode,
      columnCount: state.columnCount,
      columns: state.columns,
      // Don't persist activeColumnId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
  }, [state]);

  const setViewMode = useCallback((mode: MultiColumnFeedState['viewMode']) => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  const setColumnCount = useCallback((count: number) => {
    setState(prev => {
      const newColumns = [...prev.columns];
      // Add or remove columns as needed
      while (newColumns.length < count) {
        newColumns.push({
          id: `col-${Date.now()}-${Math.random()}`,
          feedType: 'home',
          sort: 'hot',
          timeRange: 'day',
          omniOnly: false,
          cursorStack: [],
          currentCursor: '',
        });
      }
      while (newColumns.length > count) {
        newColumns.pop();
      }
      return { ...prev, columnCount: count, columns: newColumns };
    });
  }, []);

  const updateColumnConfig = useCallback((columnId: string, config: Partial<ColumnConfig>) => {
    setState(prev => ({
      ...prev,
      columns: prev.columns.map(col =>
        col.id === columnId ? { ...col, ...config } : col
      ),
    }));
  }, []);

  const setActiveColumn = useCallback((columnId: string | null) => {
    setState(prev => ({ ...prev, activeColumnId: columnId }));
  }, []);

  const addColumn = useCallback(() => {
    setState(prev => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          id: `col-${Date.now()}-${Math.random()}`,
          feedType: 'home',
          sort: 'hot',
          timeRange: 'day',
          omniOnly: false,
          cursorStack: [],
          currentCursor: '',
        },
      ],
      columnCount: prev.columnCount + 1,
    }));
  }, []);

  const removeColumn = useCallback((columnId: string) => {
    setState(prev => {
      // Don't allow removing if only one column left
      if (prev.columns.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        columns: prev.columns.filter(col => col.id !== columnId),
        columnCount: prev.columnCount - 1,
      };
    });
  }, []);

  const resetColumns = useCallback(() => {
    setState(prev => ({
      ...prev,
      columns: createDefaultColumns(),
      columnCount: 3,
    }));
  }, []);

  const value: MultiColumnFeedContextValue = {
    state,
    setViewMode,
    setColumnCount,
    updateColumnConfig,
    setActiveColumn,
    addColumn,
    removeColumn,
    resetColumns,
  };

  return (
    <MultiColumnFeedContext.Provider value={value}>
      {children}
    </MultiColumnFeedContext.Provider>
  );
}

export function useMultiColumnFeed() {
  const context = useContext(MultiColumnFeedContext);
  if (!context) {
    throw new Error('useMultiColumnFeed must be used within MultiColumnFeedProvider');
  }
  return context;
}
