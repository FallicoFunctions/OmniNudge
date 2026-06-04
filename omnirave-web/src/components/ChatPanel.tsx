import { useEffect, useId, useState } from 'react';
import type { RuntimeChatMessage } from '../lib/session';

export function ChatPanel(props: {
  messages: RuntimeChatMessage[];
  onSendMessage: (body: string) => void;
  isSending: boolean;
  initialHistoryCollapsed?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(props.initialHistoryCollapsed ?? false);
  const chatLogId = useId();

  useEffect(() => {
    setHistoryCollapsed(props.initialHistoryCollapsed ?? false);
  }, [props.initialHistoryCollapsed]);

  const handleSend = () => {
    const body = draft.trim();
    if (!body) {
      return;
    }

    props.onSendMessage(body);
    setDraft('');
  };

  return (
    <section className="chat-panel">
      <div className="chat-panel-header">
        <div>
          <p className="hud-kicker">Room Chat</p>
          <h2>Chat</h2>
        </div>
        <button
          type="button"
          className="chat-collapse-button"
          aria-expanded={!historyCollapsed}
          aria-controls={chatLogId}
          onClick={() => setHistoryCollapsed((current) => !current)}
        >
          {historyCollapsed ? 'Expand chat history' : 'Collapse chat history'}
        </button>
      </div>
      {!historyCollapsed ? (
        <div id={chatLogId} className="chat-log" aria-live="polite">
          {props.messages.length ? (
            props.messages.map((message, index) => (
              <p key={`${message.playerId}-${message.createdAt}-${index}`} className="chat-line">
                <strong>{message.playerName}:</strong> {message.body}
              </p>
            ))
          ) : (
            <p className="chat-empty">No messages yet. Start the room.</p>
          )}
        </div>
      ) : (
        <div id={chatLogId} className="chat-log chat-log-collapsed" aria-hidden="true" />
      )}
      <label className="chat-composer">
        <span className="sr-only">Message</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type message..."
        />
      </label>
      <button type="button" className="chat-send-button" onClick={handleSend} disabled={props.isSending}>
        {props.isSending ? 'Sending…' : 'Send'}
      </button>
    </section>
  );
}
