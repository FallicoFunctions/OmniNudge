import type { ReactNode } from 'react';
import { BaseSlideshow } from './BaseSlideshow';
import type { SlideshowItem } from './BaseSlideshow';
import { SlideshowControls } from './SlideshowControls';

interface MediaSlideshowProps {
  items: Array<{
    id: string | number;
    element: ReactNode;
  }>;
  initialIndex?: number;
  onClose: () => void;
  /** Optional mini chat strip rendered below the media. */
  chatContent?: ReactNode;
}

export function MediaSlideshow({
  items,
  initialIndex = 0,
  onClose,
  chatContent,
}: MediaSlideshowProps) {
  const slideshowItems: SlideshowItem[] = items.map((item) => ({
    id: item.id,
    content: item.element,
  }));

  return (
    <BaseSlideshow
      items={slideshowItems}
      initialIndex={initialIndex}
      onClose={onClose}
      autoAdvance={false}
      autoAdvanceInterval={5000}
      showControls={true}
      bottomContent={chatContent}
      renderControls={({
        autoAdvance,
        autoAdvanceInterval,
        onToggleAutoAdvance,
        onChangeInterval,
      }) => (
        <SlideshowControls
          autoAdvance={autoAdvance}
          autoAdvanceInterval={autoAdvanceInterval}
          onToggleAutoAdvance={onToggleAutoAdvance}
          onChangeInterval={onChangeInterval}
        />
      )}
    />
  );
}
