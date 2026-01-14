import { PageShell } from '../common/PageShell';

export function AboutContent({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-6 text-sm text-[var(--color-text-secondary)] ${className}`}>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">OmniNudge(beta)</h2>
      <p>
        Welcome to OmniNudge(beta). Originally, I wanted to call this Omni. Omni means "all" and this platform is going to be able to do all that you can do online. Unfortunately, Omni.com was already
        taken. So I added “Nudge,” because of its definition relating to social media.
      </p>

      <p>
        Currently, this site is essentially a Reddit clone with an end-to-end encrypted messaging
        system. The messaging system also allows you to send any file type (which is also encrypted).
      </p>

      <p>
        Please note: Reddit has been cracking down on third-party apps that access their API. Access to Reddit posts may stop at any time and without warning.
      </p>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          What OmniNudge Is Right Now
        </h2>
        <p className="mt-2">
          Like Reddit, OmniNudge lets you create communities called hubs that are the same as
          subreddits. OmniNudge also lets you browse Reddit. You can view Reddit posts and even
          subscribe to your favorite subreddits. OmniNudge also lets you make posts and comments in
          subreddits. But to be clear, your posts and comments in subreddits are not actually sent to
          Reddit. A Reddit user will not see your comment on their post, but other Omni users will.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          The Future for OmniNudge
        </h2>
        <p className="mt-2">
          I am creating this website to be the last website anyone will ever need. It will be an
          amalgamation of all social media sites (Facebook, Instagram, Snapchat, TikTok, LinkedIn,
          etc.). It will contain a productive office suite, a gaming ecosystem, video and audio
          hosting, Discord/Zoom/Slack-style communication capabilities, email, banking, stocks and
          crypto, AI, a mobile app, and a desktop program. Anything I think of, I will add to this
          platform.
        </p>
      </div>

      <p>
        Remember MySpace and how you could completely customize your profile? I plan on implementing
        complex theming for users. To provide the capability of making pages the way you want to. Not
        just your outward facing profile page or hub that you created, but your internal browsing
        pages too. I also plan on introducing advanced settings. Many times, I’ve been using a
        program and thought, &quot;it would be great if I could just change this one thing.&quot; I intend to
        make my platform the most settings-rich platform that exists. And for those who don’t want
        that level of complexity for themes or settings, there will be basic defaults and easy-to-
        understand settings.
      </p>

      <p>
        Ultimately, and eventually, it will be similar to—if not actually—an operating system. This
        platform will never be finished.
      </p>

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          What’s Next in the Immediate Future?
        </h2>
        <p className="mt-2">
          The next steps are to enhance the messaging features. I plan to create a powerhouse of
          conversation features, such as (but not limited to):
        </p>
        <div className="mt-2 space-y-1">
          <div>Time-activated auto-deletion of messages</div>
          <div>Voice notes</div>
          <div>Voice and video calls</div>
          <div>Screen sharing</div>
          <div>Audio player</div>
        </div>
      </div>

      <div>
        <p>
          In addition to upgrading the chatting system, there will be upgrades to the social media
          aspects of the site, such as (but not limited to):
        </p>
        <div className="mt-2 space-y-1">
          <div>Friends and followers</div>
          <div>Multiple profiles allowing you to cater to different niches and interests</div>
          <div>Karma point system</div>
          <div>Awards and badges</div>
        </div>

        <div className="mt-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Bug Reporting</h2>
          <p className="mt-2">
            There will be plenty of bugs so be sure to report them. You can find a list of known bugs
            and report bugs here:{' '}
            <a href="/bug-reporting" className="text-[var(--color-primary)] underline">
              Bug Reporting
            </a>
          </p>
          <p className="mt-2">
            <a href="/terms" className="text-[var(--color-primary)] underline">
              Terms of Service
            </a>
          </p>
          <p className="mt-2">
            <a href="/privacy" className="text-[var(--color-primary)] underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AboutPageContent() {
  return (
    <PageShell>
      <AboutContent />
    </PageShell>
  );
}
