export const AdminBadge = ({ role }: { role: 'owner' | 'admin' }) => (
  <span
    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold ${
      role === 'owner'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-blue-100 text-[var(--color-primary)] dark:bg-blue-900/30 dark:text-[var(--color-primary-light)]'
    }`}
  >
    {role === 'owner' ? '\u{1F451}' : '\u{1F6E1}\uFE0F'} {role === 'owner' ? 'Owner' : 'Admin'}
  </span>
);
