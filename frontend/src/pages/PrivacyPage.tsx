export default function PrivacyPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Effective date: January 10, 2026
      </p>

      <div className="mt-6 space-y-6 text-sm text-[var(--color-text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            1. What We Collect
          </h2>
          <p className="mt-2">
            We collect account information you provide (such as username and email), content you
            post, and information related to your use of OmniNudge (such as pages you visit and
            actions you take). We also collect technical data like IP address, device, and browser
            details to keep the platform secure and functional.
          </p>
        </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              2. How We Use Data
            </h2>
            <p className="mt-2">
              We use your data to operate OmniNudge, provide features, improve the service, prevent
              abuse, and communicate with you. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              3. Reddit Content
            </h2>
            <p className="mt-2">
              OmniNudge may display Reddit posts and comments for browsing and context. We do not
              send your posts or comments to Reddit, and we are not affiliated with Reddit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              4. Messaging and Files
            </h2>
            <p className="mt-2">
              Direct messages and shared files are encrypted. You are responsible for the content
              you send and share. We do not guarantee that encryption will prevent all unauthorized
              access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              5. Cookies and Local Storage
            </h2>
            <p className="mt-2">
              We use cookies and local storage to keep you signed in, remember preferences, and
              improve user experience. You can disable cookies in your browser, but some features
              may not work correctly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              6. Sharing and Disclosure
            </h2>
            <p className="mt-2">
              We may share information with service providers who help us run OmniNudge. We may also
              disclose information if required by law or to protect users and the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              7. Data Retention
            </h2>
            <p className="mt-2">
              We retain data as long as needed to operate the service, comply with legal obligations,
              or resolve disputes. You may request account deletion subject to applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              8. Your Choices
            </h2>
            <p className="mt-2">
              You can update your profile information, adjust settings, and control some data
              visibility within the app. You can also request access or deletion of your personal
              data where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              9. Changes to This Policy
            </h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. Continued use of OmniNudge means
              you accept the updated policy.
            </p>
          </section>
      </div>
    </PageShell>
  );
}
import { PageShell } from '../components/common/PageShell';
