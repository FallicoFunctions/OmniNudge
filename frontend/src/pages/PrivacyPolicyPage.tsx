export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

      <div className="prose max-w-none">
        <p className="text-sm text-secondary mb-6">Last Updated: February 6, 2026</p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>

          <h3 className="text-xl font-medium mb-2">1.1 Account Information</h3>
          <p className="mb-4">
            When you create an account, we collect your username, email address, and password (stored encrypted).
          </p>

          <h3 className="text-xl font-medium mb-2">1.2 Content You Create</h3>
          <p className="mb-4">
            We store messages, posts, comments, and media you upload. Messages are end-to-end encrypted and we cannot read them.
          </p>

          <h3 className="text-xl font-medium mb-2">1.3 Usage Information</h3>
          <p className="mb-4">
            We collect information about how you use OmniNudge, including pages visited, features used, and interaction patterns.
          </p>

          <h3 className="text-xl font-medium mb-2">1.4 Device Information</h3>
          <p className="mb-4">
            We collect device type, operating system, browser type, and IP address for security and service improvement.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide and maintain our services</li>
            <li>Process your requests and transactions</li>
            <li>Send important service notifications</li>
            <li>Detect and prevent fraud and abuse</li>
            <li>Improve our services based on usage patterns</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. End-to-End Encryption</h2>
          <p className="mb-4">
            All private messages are end-to-end encrypted using RSA-2048 and AES-256 encryption. This means:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Only you and the recipient can read messages</li>
            <li>OmniNudge cannot read your encrypted messages</li>
            <li>Your encryption keys are stored only on your devices</li>
            <li>Messages cannot be recovered if you lose your encryption keys</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Data Sharing</h2>
          <p className="mb-4">We do not sell your personal information. We may share data with:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Service Providers:</strong> Cloud hosting (AWS), email delivery (SendGrid), analytics</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect rights and safety</li>
            <li><strong>Business Transfers:</strong> In case of merger, acquisition, or asset sale</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Your Rights (GDPR)</h2>
          <p className="mb-4">If you're in the EU/EEA, you have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Access:</strong> Request a copy of your data</li>
            <li><strong>Rectification:</strong> Correct inaccurate data</li>
            <li><strong>Erasure:</strong> Request deletion of your data</li>
            <li><strong>Portability:</strong> Export your data in machine-readable format</li>
            <li><strong>Objection:</strong> Object to certain data processing</li>
            <li><strong>Restriction:</strong> Limit how we use your data</li>
          </ul>
          <p className="mt-4">
            To exercise these rights, visit your <a href="/settings/privacy" className="text-primary hover:underline">Privacy Settings</a> or email privacy@omninudge.com.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. California Privacy Rights (CCPA)</h2>
          <p className="mb-4">If you're a California resident, you have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Know what personal information we collect and how we use it</li>
            <li>Request deletion of your personal information</li>
            <li>Opt-out of the sale of personal information (we don't sell your data)</li>
            <li>Non-discrimination for exercising your rights</li>
          </ul>
          <p className="mt-4">
            <a href="/ccpa" className="text-primary hover:underline">Learn more about your California privacy rights</a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
          <p className="mb-4">We retain your data for as long as your account is active or as needed to provide services:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Messages:</strong> 3 years or until you delete them</li>
            <li><strong>Account data:</strong> Until you delete your account</li>
            <li><strong>Usage logs:</strong> 90 days</li>
            <li><strong>Audit logs:</strong> 7 years (legal compliance)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Security</h2>
          <p className="mb-4">
            We implement industry-standard security measures including encryption, secure authentication,
            regular security audits, and monitoring for suspicious activity. However, no method of
            transmission over the internet is 100% secure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
          <p className="mb-4">
            OmniNudge is not intended for children under 13. We do not knowingly collect information
            from children under 13. If we learn we have collected such information, we will delete it immediately.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. Cookies</h2>
          <p className="mb-4">We use cookies and similar technologies for:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Authentication and security</li>
            <li>Preferences and settings</li>
            <li>Analytics and performance</li>
          </ul>
          <p className="mt-4">
            You can control cookies through your browser settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
          <p className="mb-4">
            We may update this privacy policy from time to time. We will notify you of material
            changes by email or prominent notice on our service. Continued use after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
          <p className="mb-4">
            If you have questions about this privacy policy or our data practices:
          </p>
          <ul className="list-none space-y-2">
            <li>Email: privacy@omninudge.com</li>
            <li>Address: [Company Address]</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Data Protection Officer</h2>
          <p className="mb-4">
            For EU/EEA users, you can contact our Data Protection Officer at: dpo@omninudge.com
          </p>
        </section>
      </div>
    </div>
  );
}
