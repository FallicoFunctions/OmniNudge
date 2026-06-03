import { useState } from 'react';
import type { RuntimeChatMessage } from '../lib/session';

export function ChatPanel(props: {
  messages: RuntimeChatMessage[];
  onSendMessage: (body: string) => void;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    const body = draft.trim();
    if (!body) {
      return;
    }

    props.onSendMessage(body);
    setDraft('');
  };

  return (
    <section className="side-panel">
      <h2>Chat</h2>
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
      <label className="chat-composer">
        <span>Message</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something to the crowd"
        />
      </label>
      <button type="button" className="loadout-save-button" onClick={handleSend} disabled={props.isSending}>
        {props.isSending ? 'Sending…' : 'Send'}
      </button>
    </section>
  );
}
