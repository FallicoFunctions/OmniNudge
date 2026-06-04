import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { EmoteBar } from './components/EmoteBar';
import { Hud } from './components/Hud';
import { SettingsPanel } from './components/SettingsPanel';
import { StageAudioDeck } from './components/StageAudioDeck';
import { StageScreen } from './components/StageScreen';
import { TopLeftControls } from './components/TopLeftControls';
import { TopRightAuthControls } from './components/TopRightAuthControls';
import { TouchControls } from './components/TouchControls';
import { VenueStatusPanel } from './components/VenueStatusPanel';
import { WorldScene } from './components/WorldScene';
import { useMobileMediaUnlock } from './hooks/useMobileMediaUnlock';
import { useWorldSession } from './hooks/useWorldSession';
import { syncAuthoritativeStagePlayback, type StagePlayerMap } from './lib/youtube';

type TopLeftPanel = 'settings' | 'avatar' | null;

export default function App() {
  const {
    session,
    settings,
    updateSettings,
    chatMessages,
    error,
    isLoading,
    hasJoinedWorld,
    pendingVenue,
    moveToZone,
    respawn,
    sendChatMessage,
  } =
    useWorldSession();
  const mediaUnlock = useMobileMediaUnlock();
  const stagePlayersRef = useRef<StagePlayerMap | null>(null);
  const [openTopLeftPanel, setOpenTopLeftPanel] = useState<TopLeftPanel>(null);

  useEffect(() => {
    if (!session?.zoneMedia || !stagePlayersRef.current) {
      return;
    }

    syncAuthoritativeStagePlayback({
      currentZone: session.activeZone,
      unlocked: mediaUnlock.unlocked,
      zoneMedia: session.zoneMedia,
      players: stagePlayersRef.current,
    });
  }, [mediaUnlock.unlocked, session?.activeZone, session?.zoneMedia]);

  if ((isLoading || !hasJoinedWorld || !session) && !error) {
    return <div className="black-in-shell" aria-label="Entering OmniRave" />;
  }

  if (!session) {
    return (
      <div className="entry-error-shell">
        <div className="entry-error-card">
          <h1>Unable to enter OmniRave</h1>
          <p>The room did not open correctly. Refresh and try again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="omnirave-shell">
      <StageAudioDeck
        zoneMedia={session.zoneMedia}
        onPlayersReady={(players) => {
          stagePlayersRef.current = players;
        }}
      />
      <WorldScene session={session} unlocked={mediaUnlock.unlocked} />

      <div className="hud-anchor hud-top-left">
        <TopLeftControls
          openPanel={openTopLeftPanel}
          onToggleSettings={() => setOpenTopLeftPanel((current) => (current === 'settings' ? null : 'settings'))}
          onToggleAvatar={() => setOpenTopLeftPanel((current) => (current === 'avatar' ? null : 'avatar'))}
        />
        {openTopLeftPanel === 'settings' ? (
          <SettingsPanel settings={settings} onSettingsChange={updateSettings} onRespawn={respawn} />
        ) : null}
        {openTopLeftPanel === 'avatar' ? (
          <section className="settings-panel avatar-foundation-panel" aria-label="Avatar editor foundation">
            <p className="settings-panel-kicker">Avatar</p>
            <h2>Avatar shell</h2>
            <p className="settings-panel-note">
              Avatar editing stays out of scope for this task. This foundation reserves the anchor and interaction flow.
            </p>
          </section>
        ) : null}
      </div>

      <div className="hud-anchor hud-top-right">
        <TopRightAuthControls session={session} />
      </div>

      <div className="hud-anchor hud-bottom-left">
        <Hud session={session} />
        <ChatPanel
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          isSending={false}
          initialHistoryCollapsed={settings.chatCollapsed}
        />
      </div>

      <div className="hud-anchor hud-bottom-center">
        <EmoteBar />
      </div>

      <div className="hud-anchor hud-bottom-right">
        <VenueStatusPanel session={session} pendingVenue={pendingVenue} />
      </div>

      <main className="stage-shell">
        <StageScreen session={session} unlocked={mediaUnlock.unlocked} onMoveToZone={moveToZone} />
        {mediaUnlock.isTouchDevice ? (
          <TouchControls
            unlocked={mediaUnlock.unlocked}
            onUnlock={mediaUnlock.unlock}
            onMoveToZone={moveToZone}
          />
        ) : null}
      </main>
    </div>
  );
}
