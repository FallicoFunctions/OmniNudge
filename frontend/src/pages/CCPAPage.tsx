/**
 * P0-033: CCPA Compliance Page
 *
 * California Consumer Privacy Act compliance page.
 * Required for users in California.
 */

export default function CCPAPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold text-[var(--color-text-primary)]">
          Your California Privacy Rights
        </h1>

        <div className="space-y-6 text-[var(--color-text-primary)]">
          <section>
            <h2 className="mb-3 text-xl font-semibold">California Consumer Privacy Act (CCPA)</h2>
            <p className="leading-relaxed text-[var(--color-text-secondary)]">
              If you are a California resident, you have specific rights regarding your personal information under the California Consumer Privacy Act (CCPA).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Your Rights</h2>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li><strong>Right to Know:</strong> You can request information about the personal information we collect, use, disclose, and sell.</li>
              <li><strong>Right to Delete:</strong> You can request deletion of your personal information (subject to certain exceptions).</li>
              <li><strong>Right to Opt-Out:</strong> You can opt out of the sale of your personal information.</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Do Not Sell My Personal Information</h2>
            <p className="mb-4 leading-relaxed text-[var(--color-text-secondary)]">
              OmniNudge does not sell your personal information to third parties for monetary or other valuable consideration. We share information only as described in our Privacy Policy to provide our services.
            </p>
            <div className="rounded-md bg-blue-500/10 p-4">
              <p className="font-semibold text-blue-600 dark:text-blue-400">
                ✓ Your personal information is not sold to third parties
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Information We Collect</h2>
            <p className="mb-3 text-[var(--color-text-secondary)]">
              We collect the following categories of personal information:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li>Identifiers (username, email address, IP address)</li>
              <li>Internet or network activity (posts, comments, messages, browsing behavior)</li>
              <li>Geolocation data (approximate location from IP address)</li>
              <li>Inferences drawn from the above to create a profile about your preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">How to Exercise Your Rights</h2>
            <p className="mb-4 text-[var(--color-text-secondary)]">
              To exercise your CCPA rights, you can:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[var(--color-text-secondary)]">
              <li>
                <strong>Data Export:</strong> Go to{' '}
                <a href="/settings" className="text-[var(--color-primary)] hover:underline">
                  Settings &rarr; Account &rarr; Export Data
                </a>
              </li>
              <li>
                <strong>Delete Account:</strong> Go to{' '}
                <a href="/settings" className="text-[var(--color-primary)] hover:underline">
                  Settings &rarr; Account &rarr; Delete Account
                </a>
              </li>
              <li>
                <strong>Other Requests:</strong> Contact us at{' '}
                <a href="mailto:privacy@omninudge.com" className="text-[var(--color-primary)] hover:underline">
                  privacy@omninudge.com
                </a>
              </li>
            </ul>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              We will respond to verifiable requests within 45 days. We may request additional information to verify your identity.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Authorized Agent</h2>
            <p className="text-[var(--color-text-secondary)]">
              You may designate an authorized agent to make a request on your behalf. The agent must provide proof of authorization and we may still require you to verify your identity directly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Contact Us</h2>
            <p className="text-[var(--color-text-secondary)]">
              For questions about your California privacy rights, contact us at:
            </p>
            <div className="mt-3 rounded-md bg-[var(--color-bg-secondary)] p-4">
              <p className="text-[var(--color-text-secondary)]">
                <strong>Email:</strong>{' '}
                <a href="mailto:privacy@omninudge.com" className="text-[var(--color-primary)] hover:underline">
                  privacy@omninudge.com
                </a>
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                <strong>Subject Line:</strong> "California Privacy Rights Request"
              </p>
            </div>
          </section>

          <section className="border-t border-[var(--color-border)] pt-6">
            <p className="text-sm text-[var(--color-text-muted)]">
              Last Updated: February 2026
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
