import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CircularProgress,
  LoadingSpinner,
  ProgressBar,
  ShimmerEffect,
  SkeletonCard,
  SkeletonList,
  SkeletonPost,
} from './index';

const meta: Meta = {
  title: 'Design System/Loading',
};

export default meta;
type Story = StoryObj;

export const SpinnerSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <LoadingSpinner size="small" />
      <LoadingSpinner size="medium" />
      <LoadingSpinner size="large" />
    </div>
  ),
};

export const Shimmer: Story = {
  render: () => <ShimmerEffect className="h-12 w-80 rounded-lg" />,
};

export const SkeletonPostCard: Story = {
  render: () => (
    <div className="w-[640px] max-w-full">
      <SkeletonPost />
    </div>
  ),
};

export const SkeletonListView: Story = {
  render: () => (
    <div className="w-[640px] max-w-full">
      <SkeletonList items={4} />
    </div>
  ),
};

export const SkeletonCardView: Story = {
  render: () => (
    <div className="w-[640px] max-w-full">
      <SkeletonCard />
    </div>
  ),
};

export const DeterminateProgress: Story = {
  render: () => (
    <div className="w-[400px] max-w-full">
      <ProgressBar value={72} showLabel size="medium" />
    </div>
  ),
};

export const IndeterminateProgress: Story = {
  render: () => (
    <div className="w-[400px] max-w-full">
      <ProgressBar />
    </div>
  ),
};

export const CircularProgressExamples: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <CircularProgress value={67} showLabel />
      <CircularProgress />
    </div>
  ),
};
