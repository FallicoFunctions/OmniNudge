import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { Hud } from './components/Hud';
import { LoadoutPanel } from './components/LoadoutPanel';
import { StageAudioDeck } from './components/StageAudioDeck';
import { StageScreen } from './components/StageScreen';
import { TouchControls } from './components/TouchControls';
import { WorldScene } from './components/WorldScene';
import { useMobileMediaUnlock } from './hooks/useMobileMediaUnlock';
import { useWorldSession } from './hooks/useWorldSession';
import { syncAuthoritativeStagePlayback, type StagePlayerMap } from './lib/youtube';

type UtilityPanel = 'chat' | 'style' | null;

export default function App() {
  const {
    session,
    chatMessages,
    error,
    isLoading,
    hasJoinedWorld,
    isSavingLoadout,
    moveToZone,
    saveLoadout,
    sendChatMessage,
  } = useWorldSession();
  const mediaUnlock = useMobileMediaUnlock();
  const stagePlayersRef = useRef<StagePlayerMap | null>(null);
  const [openPanel, setOpenPanel] = useState<UtilityPanel>(null);

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
      <div className="world-topbar">
        <Hud session={session} />
        <div className="utility-dock" aria-label="OmniRave controls">
          <button type="button" className="utility-button" onClick={() => setOpenPanel('chat')}>
            Chat
          </button>
          <button type="button" className="utility-button" onClick={() => setOpenPanel('style')}>
            Style
          </button>
        </div>
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
      {openPanel ? (
        <div className="utility-sheet-backdrop" onClick={() => setOpenPanel(null)}>
          <aside
            className="utility-sheet"
            aria-label={openPanel === 'chat' ? 'Chat panel' : 'Style panel'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="utility-sheet-header">
              <button type="button" className="utility-sheet-close" onClick={() => setOpenPanel(null)}>
                Back to the room
              </button>
            </div>
            {openPanel === 'chat' ? (
              <ChatPanel messages={chatMessages} onSendMessage={sendChatMessage} isSending={false} />
            ) : (
              <LoadoutPanel session={session} onSaveLoadout={saveLoadout} isSaving={isSavingLoadout} />
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
