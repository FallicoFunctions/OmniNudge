import { useState } from 'react';
import type { RuntimeChatMessage } from '../lib/session';

export function ChatPanel(props: {
  messages: RuntimeChatMessage[];
  onSendMessage: (body: string) => void;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

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
        <button type="button" className="chat-collapse-button" onClick={() => setHistoryCollapsed((current) => !current)}>
          {historyCollapsed ? 'Expand chat history' : 'Collapse chat history'}
        </button>
      </div>
      {!historyCollapsed ? (
        <div className="chat-log" aria-live="polite">
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
        <div className="chat-log chat-log-collapsed" aria-hidden="true" />
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
