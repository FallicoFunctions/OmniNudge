import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorModal, ErrorPage, InlineError, NotFoundPage, ServerErrorPage, Toast } from './index';
import { getErrorPatternForSeverity } from '../../services/errorTrackingService';

const meta: Meta = {
  title: 'Design System/Error States',
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj;

export const ToastInfo: Story = {
  render: () => (
    <Toast type="info" message="Your profile was refreshed." description="No action needed." />
  ),
};

export const ToastWarning: Story = {
  render: () => (
    <Toast
      type="warning"
      message="Connection is unstable."
      description="Some updates may be delayed."
    />
  ),
};

export const InlineValidationError: Story = {
  render: () => <InlineError message="Email is required before continuing." />,
};

export const RecoverableErrorModal: Story = {
  render: () => (
    <ErrorModal
      isOpen
      title="Could not load conversation"
      message="The request timed out. Please retry."
      details="GET /api/v1/conversations timed out after 10s"
      onClose={() => {}}
      onRetry={() => {}}
    />
  ),
};

export const FatalErrorPage: Story = {
  render: () => (
    <div className="w-[800px] max-w-full">
      <ErrorPage
        title="System is unavailable"
        message="We are restoring service. Please try again in a few minutes."
        statusCode={503}
      />
    </div>
  ),
};

export const NotFound: Story = {
  render: () => (
    <div className="w-[800px] max-w-full">
      <NotFoundPage />
    </div>
  ),
};

export const ServerError: Story = {
  render: () => (
    <div className="w-[800px] max-w-full">
      <ServerErrorPage />
    </div>
  ),
};

export const SeverityToPatternMap: Story = {
  render: () => {
    const severities = ['info', 'warning', 'error', 'critical'] as const;
    return (
      <div className="w-[420px] max-w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
          Severity to pattern mapping
        </h3>
        <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          {severities.map((severity) => (
            <li key={severity} className="flex justify-between">
              <span className="font-medium text-[var(--color-text-primary)]">{severity}</span>
              <span>{getErrorPatternForSeverity(severity)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  },
};
