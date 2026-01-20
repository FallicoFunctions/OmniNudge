import { useEffect, useRef } from 'react';
import { useMultiColumnFeed } from '../../contexts/MultiColumnFeedContext';
import { ColumnFeed } from './ColumnFeed';
import { ColumnConfigPanel } from './ColumnConfigPanel';

export function MultiColumnFeedView() {
  const { state, setActiveColumn } = useMultiColumnFeed();
  const containerRef = useRef<HTMLDivElement>(null);

  // Track mouse position to determine active column
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const columnWidth = rect.width / state.columnCount;
      const columnIndex = Math.floor(relativeX / columnWidth);

      if (columnIndex >= 0 && columnIndex < state.columns.length) {
        const columnId = state.columns[columnIndex].id;
        setActiveColumn(columnId);
      }
    };

    const handleMouseLeave = () => {
      setActiveColumn(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [state.columnCount, state.columns, setActiveColumn]);

  return (
    <div className="multi-column-container view-mode-multi-column h-screen flex flex-col bg-[var(--color-background)]">
      {/* Column config panels - collapsible */}
      <div className="config-panels flex border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {state.columns.map(col => (
          <ColumnConfigPanel key={col.id} columnId={col.id} config={col} />
        ))}
      </div>

      {/* Columns grid */}
      <div
        ref={containerRef}
        className="columns-grid flex-1 flex overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${state.columnCount}, 1fr)`,
          gap: 0,
        }}
      >
        {state.columns.map((col, index) => (
          <ColumnFeed
            key={col.id}
            columnId={col.id}
            config={col}
            isActive={state.activeColumnId === col.id}
            showBorder={index < state.columns.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
