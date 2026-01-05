import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { modMailService } from '../../services/modMailService';
import { hubsService } from '../../services/hubsService';
import { encryptionService } from '../../services/encryptionService';
import { getOwnKeys, getUserPublicKey } from '../../services/keyManagementService';
import { encryptForMultipleRecipients, type MultiRecipientEncryptionResult } from '../../utils/encryption';
import { useAuth } from '../../contexts/AuthContext';

interface ModMailModalProps {
  hubName: string;
  onClose: () => void;
}

export function ModMailModal({ hubName, onClose }: ModMailModalProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [encryptionWarning, setEncryptionWarning] = useState<string | null>(null);

  const prepareEncryptionPayload = async (): Promise<
    | (MultiRecipientEncryptionResult & {
        is_multi_recipient: true;
        encryption_version: string;
      })
    | { is_multi_recipient: false; encryption_version: string; message: string }
  > => {
    // Fetch hub moderators to build the participant list (user + moderators)
    const hub = await hubsService.getHub(hubName);
    const moderatorIds = hub.moderators?.map((mod) => mod.id) ?? [];
    const participantIds = Array.from(
      new Set(
        [user?.id, ...moderatorIds].filter((id): id is number => typeof id === 'number')
      )
    );

    if (!participantIds.length) {
      setEncryptionWarning('No participants found to encrypt the message for; sending plaintext.');
      return { is_multi_recipient: false, encryption_version: 'plaintext', message };
    }

    // Fetch public keys for all participants
    const publicKeys = await encryptionService.getPublicKeys(participantIds);
    const cryptoKeys: { userId: number; publicKey: CryptoKey }[] = [];
    const missing: number[] = [];

    for (const pid of participantIds) {
      const keyBase64 = publicKeys[pid];
      if (!keyBase64) {
        missing.push(pid);
        continue;
      }
      const publicKey = await getUserPublicKey(pid, keyBase64);
      if (publicKey) {
        cryptoKeys.push({ userId: pid, publicKey });
      } else {
        missing.push(pid);
      }
    }

    const ownKeys = await getOwnKeys();

    if (!cryptoKeys.length || missing.length || !ownKeys?.publicKey) {
      if (missing.length) {
        setEncryptionWarning(
          `Missing public keys for participants: ${missing.join(
            ', '
          )}. Sending message as plaintext.`
        );
      } else if (!ownKeys?.publicKey) {
        setEncryptionWarning('No local encryption key found. Sending message as plaintext.');
      }
      return { is_multi_recipient: false, encryption_version: 'plaintext', message };
    }

    const encrypted = await encryptForMultipleRecipients(message, cryptoKeys, ownKeys.publicKey);
    setEncryptionWarning(null);

    return {
      ...encrypted,
      is_multi_recipient: true,
      encryption_version: 'v2',
    };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const encryptionPayload = await prepareEncryptionPayload();
      const request =
        encryptionPayload.is_multi_recipient === true
          ? {
              hub_name: hubName,
              subject,
              encrypted_content: encryptionPayload.encryptedContent,
              sender_encrypted_content:
                encryptionPayload.senderEncryptedContent ?? encryptionPayload.encryptedContent,
              encryption_version: encryptionPayload.encryption_version,
              is_multi_recipient: encryptionPayload.is_multi_recipient,
              shared_encryption_iv: encryptionPayload.sharedIv,
              recipient_keys: encryptionPayload.recipientKeys,
            }
          : {
              hub_name: hubName,
              subject,
              message: encryptionPayload.message,
              encryption_version: encryptionPayload.encryption_version,
              is_multi_recipient: false,
            };

      return modMailService.createModMail(request);
    },
    onSuccess: () => {
      setSuccess(true);
      setEncryptionWarning(null);
      // Close the modal after a brief delay to show success message
      setTimeout(() => {
        onClose();
      }, 1500);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      const friendlyMessage =
        error?.response?.data?.error || error?.message || 'Failed to send mod mail';
      setError(friendlyMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }

    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--color-surface-elevated)] rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold">Message the Moderators</h3>
            <p className="text-[var(--color-text-secondary)] text-sm mt-1">
              Send a message to the moderators of h/{hubName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium mb-2">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              placeholder="What's this about?"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-2">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Write your message to the moderators..."
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}

          {encryptionWarning && (
            <div className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded p-3">
              {encryptionWarning}
            </div>
          )}

          {success && (
            <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded p-3">
              Message sent successfully! The moderators will see your message.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending || success}
              className="px-4 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || success}
              className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Sending...' : success ? 'Sent!' : 'Send to Moderators'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
