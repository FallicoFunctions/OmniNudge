import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, EmptyConversations, EmptySearchResults, ErrorState, PermissionDenied } from './index';
import { Inbox } from 'lucide-react';

const meta: Meta<typeof EmptyState> = {
  title: 'Design System/Empty States',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const GenericNoData: Story = {
  args: {
    illustration: 'noData',
    icon: Inbox,
    title: 'No content yet',
    description: 'Create your first item to get started.',
    action: {
      label: 'Create Item',
      onClick: () => {},
    },
  },
};

export const NoResults: Story = {
  args: {
    illustration: 'noResults',
    title: 'No matching results',
    description: 'Try different keywords or clear filters.',
  },
};

export const ErrorVariant: Story = {
  render: () => <ErrorState onRetry={() => {}} />,
};

export const PermissionVariant: Story = {
  render: () => <PermissionDenied resource="this hub" onRequestAccess={() => {}} />,
};

export const ConversationVariant: Story = {
  render: () => <EmptyConversations onCreate={() => {}} />,
};

export const SearchVariantWithQuery: Story = {
  render: () => <EmptySearchResults query="retro game soundtrack" />,
};
