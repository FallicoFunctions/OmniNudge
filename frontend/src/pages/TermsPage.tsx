export default function TermsPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Terms of Service</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Effective date: January 10, 2026
      </p>

      <div className="mt-6 space-y-6 text-sm text-[var(--color-text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">1. Acceptance</h2>
          <p className="mt-2">
            By accessing or using OmniNudge, you agree to these Terms of Service. If you do not
            agree, do not use the service.
          </p>
        </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              2. Who We Are
            </h2>
            <p className="mt-2">
              OmniNudge is a platform for communities, conversations, and content. We provide
              on-site hubs, private messaging, and a unified browsing experience that can include
              Reddit content for convenience.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              3. Not Reddit
            </h2>
            <p className="mt-2">
              OmniNudge is not affiliated with Reddit. Content you post to OmniNudge is not posted
              to Reddit. Any Reddit content shown in OmniNudge is for browsing and context only.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              4. Accounts
            </h2>
            <p className="mt-2">
              You are responsible for your account and for all activity on it. Provide accurate
              information and keep your credentials secure. We may suspend or terminate accounts for
              violations of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              5. Content and Conduct
            </h2>
            <p className="mt-2">
              You are responsible for content you submit. Do not post unlawful, harmful, or abusive
              material, and do not attempt to disrupt the service. We may remove content or restrict
              access when necessary to protect the platform and its users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              6. Messaging and File Sharing
            </h2>
            <p className="mt-2">
              OmniNudge offers encrypted messaging and file sharing. You are responsible for the
              files you share and for complying with applicable laws. We do not guarantee that
              encryption will prevent all unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              7. Intellectual Property
            </h2>
            <p className="mt-2">
              You retain rights to your content. By posting to OmniNudge, you grant us a license to
              host, display, and distribute that content within the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              8. Availability and Changes
            </h2>
            <p className="mt-2">
              We may update, change, or discontinue any part of OmniNudge at any time. We may update
              these terms, and continued use of the service means you accept the changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              9. Disclaimer
            </h2>
            <p className="mt-2">
              OmniNudge is provided on an "as is" and "as available" basis without warranties of any
              kind. Use the service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              10. Limitation of Liability
            </h2>
            <p className="mt-2">
              To the fullest extent permitted by law, OmniNudge is not liable for any indirect,
              incidental, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              11. A.I. Agents
            </h2>
            <p className="mt-2">
              During the beta phase, OmniNudge uses A.I. Agents to enhance user experience until the userbase is large enough to support itself without the need of the agents.
            </p>
          </section>
      </div>
    </PageShell>
  );
}
import { PageShell } from '../components/common/PageShell';
