export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Welcome to OmniNudge
        </h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          Browse Reddit, chat with friends, and connect with the community
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Feature cards */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Browse Reddit
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Explore posts from your favorite subreddits
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Encrypted Chat
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Secure messaging with multimedia support
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Create Posts
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Share your thoughts with the community
          </p>
        </div>
      </div>
    </div>
  );
}
