import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import { Modal } from '../components/common/Modal';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { OmniChatGroupMessage } from '../types/omnichat';
import { omnichatQueryKeys, omnichatService } from '../services/omnichatService';

const GROUP_MESSAGE_PAGE_SIZE = 100;
const GROUP_LIST_PAGE_SIZE = 50;

export function OmniChatGroupsWorkspace() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [draft, setDraft] = useState('');
  const [responders, setResponders] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const attemptedInviteRef = useRef('');

  const groupsQuery = useInfiniteQuery({
    queryKey: omnichatQueryKeys.groups,
    initialPageParam: undefined as { before: string; beforeId: string } | undefined,
    queryFn: ({ pageParam }) =>
      omnichatService.listGroups(pageParam?.before, pageParam?.beforeId, GROUP_LIST_PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < GROUP_LIST_PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return { before: oldest.last_message_at, beforeId: oldest.id };
    },
  });
  const groupQuery = useQuery({
    queryKey: omnichatQueryKeys.group(selectedGroupId),
    queryFn: () => omnichatService.getGroup(selectedGroupId),
    enabled: Boolean(selectedGroupId),
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: omnichatQueryKeys.groupMessages(selectedGroupId),
    initialPageParam: undefined as { before: string; beforeId: string } | undefined,
    queryFn: ({ pageParam }) =>
      omnichatService.listGroupMessages(
        selectedGroupId,
        pageParam?.before,
        pageParam?.beforeId,
        GROUP_MESSAGE_PAGE_SIZE
      ),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < GROUP_MESSAGE_PAGE_SIZE) return undefined;
      const oldest = lastPage[0];
      return { before: oldest.created_at, beforeId: oldest.id };
    },
    enabled: Boolean(selectedGroupId),
  });

  const joinMutation = useMutation({
    mutationFn: omnichatService.joinGroup,
    onSuccess: (group) => {
      setSelectedGroupId(group.id);
      setSearchParams({}, { replace: true });
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.groups });
    },
  });
  const inviteToken = searchParams.get('invite') ?? '';
  const joinGroup = joinMutation.mutate;
  useEffect(() => {
    if (!inviteToken || attemptedInviteRef.current === inviteToken) return;
    attemptedInviteRef.current = inviteToken;
    // Remove the bearer-style invite from browser history and same-origin
    // Referer headers before making any network requests.
    setSearchParams({}, { replace: true });
    joinGroup(inviteToken);
  }, [inviteToken, joinGroup, setSearchParams]);

  const sendMutation = useMutation({
    mutationFn: ({ content, personaIds }: { content: string; personaIds: number[] }) =>
      omnichatService.sendGroupMessage(selectedGroupId, content, personaIds),
    onSuccess: (messages) => {
      queryClient.setQueryData<InfiniteData<OmniChatGroupMessage[]>>(
        omnichatQueryKeys.groupMessages(selectedGroupId),
        (previous) => {
          if (!previous) return { pages: [messages], pageParams: [undefined] };
          const seen = new Set(previous.pages.flat().map((message) => message.id));
          const additions = messages.filter((message) => !seen.has(message.id));
          if (additions.length === 0) return previous;
          const pages = [...previous.pages];
          pages[0] = [...pages[0], ...additions];
          return { ...previous, pages };
        }
      );
      setDraft('');
      setResponders([]);
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.groups });
    },
  });
  const inviteMutation = useMutation({
    mutationFn: () => omnichatService.createGroupInvite(selectedGroupId, 25),
    onSuccess: ({ token }) =>
      setInviteUrl(
        new URL(
          `/omnichat/groups?invite=${encodeURIComponent(token)}`,
          window.location.origin
        ).toString()
      ),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || !selectedGroupId) return;
    sendMutation.mutate({ content: draft.trim(), personaIds: responders });
  };
  const selectedGroup = groupQuery.data;
  const groups = groupsQuery.data?.pages.flat() ?? [];
  const messages = messagesQuery.data?.pages.slice().reverse().flat() ?? [];

  return (
    <div className="min-h-[calc(100dvh-var(--omnichat-header-offset))] bg-[#0d0e13] p-3 sm:p-5">
      {joinMutation.isError && (
        <div
          role="alert"
          className="mx-auto mb-3 max-w-[1500px] rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
        >
          This group invite is invalid or has expired.
        </div>
      )}
      <div className="mx-auto grid h-[calc(100dvh-var(--omnichat-header-offset)-2.5rem)] max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-[#121318] shadow-2xl lg:grid-cols-[310px,1fr]">
        <aside
          className={`${selectedGroupId ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-white/10 bg-[#101116]`}
        >
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <div>
              <p className="text-xl font-semibold text-white">Groups</p>
              <p className="mt-1 text-xs text-white/35">People and characters together</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              aria-label="Create group"
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500 text-white"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {groupsQuery.isLoading && (
              <Loader2 className="mx-auto mt-10 animate-spin text-indigo-300" />
            )}
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-label={`Open ${group.name}`}
                onClick={() => setSelectedGroupId(group.id)}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selectedGroupId === group.id ? 'bg-indigo-500/15' : 'hover:bg-white/[0.04]'}`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400/25 to-blue-500/15 text-white">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{group.name}</p>
                  <p className="truncate text-xs text-white/38">
                    {group.description || 'Shared OmniChat group'}
                  </p>
                </div>
              </button>
            ))}
            {groupsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void groupsQuery.fetchNextPage()}
                disabled={groupsQuery.isFetchingNextPage}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-white/60 disabled:opacity-40"
              >
                {groupsQuery.isFetchingNextPage && <Loader2 size={15} className="animate-spin" />}
                Load more groups
              </button>
            )}
            {!groupsQuery.isLoading && groups.length === 0 && (
              <div className="mt-12 text-center text-sm text-white/35">
                <UsersRound className="mx-auto mb-3" />
                <p>No groups yet.</p>
                <button onClick={() => setShowCreate(true)} className="mt-3 text-indigo-300">
                  Create your first group
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className={`${selectedGroupId ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`}>
          {!selectedGroupId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-white/35">
              <MessageSquarePlus size={48} />
              <p className="mt-4 text-lg font-medium text-white/70">Choose a group</p>
              <p className="mt-1 text-sm">Chat with friends and characters in one room.</p>
            </div>
          ) : !selectedGroup ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="animate-spin text-indigo-300" />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
                <button
                  onClick={() => setSelectedGroupId('')}
                  className="rounded-full p-2 text-white/55 lg:hidden"
                >
                  <X size={18} />
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-semibold text-white">
                    {selectedGroup.name}
                  </h1>
                  <p className="truncate text-xs text-white/38">
                    {selectedGroup.members.length} people · {selectedGroup.personas.length}{' '}
                    characters
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inviteMutation.mutate()}
                  disabled={inviteMutation.isPending}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white/60 hover:text-white"
                >
                  <UserPlus size={14} /> Invite
                </button>
              </header>
              {inviteUrl && (
                <div className="flex items-center gap-2 border-b border-white/10 bg-indigo-500/8 px-4 py-2 text-xs text-indigo-100">
                  <span className="min-w-0 flex-1 truncate">{inviteUrl}</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                    aria-label="Copy invite"
                  >
                    <Copy size={14} />
                  </button>
                  <button type="button" onClick={() => setInviteUrl('')}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                {messagesQuery.hasNextPage && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void messagesQuery.fetchNextPage()}
                      disabled={messagesQuery.isFetchingNextPage}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 hover:text-white disabled:opacity-40"
                    >
                      {messagesQuery.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                    </button>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[82%] ${message.sender_type === 'user' ? 'order-1' : ''}`}
                    >
                      <p
                        className={`mb-1 text-xs ${message.sender_type === 'persona' ? 'text-indigo-300' : 'text-white/35'}`}
                      >
                        {message.sender_name}
                      </p>
                      <div
                        className={`rounded-3xl px-4 py-3 text-sm leading-6 ${message.sender_type === 'user' ? 'bg-indigo-500 text-white' : 'border border-white/8 bg-white/[0.055] text-white/78'}`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {!messagesQuery.isLoading && messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center text-center text-white/35">
                    <MessageSquarePlus size={38} />
                    <p className="mt-3 text-white/65">Start the group story</p>
                    <p className="mt-1 text-sm">
                      Select a character below if you want them to answer.
                    </p>
                  </div>
                )}
              </div>
              <form onSubmit={submit} className="border-t border-white/10 p-3 sm:p-4">
                {selectedGroup.personas.length > 0 && (
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                    {selectedGroup.personas.map((persona) => {
                      const selected = responders.includes(persona.persona_id);
                      return (
                        <button
                          key={persona.persona_id}
                          aria-label={`Ask ${persona.name}`}
                          type="button"
                          onClick={() =>
                            setResponders((previous) =>
                              selected
                                ? previous.filter((id) => id !== persona.persona_id)
                                : previous.length < 3
                                  ? [...previous, persona.persona_id]
                                  : previous
                            )
                          }
                          className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${selected ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100' : 'border-white/10 text-white/48'}`}
                        >
                          {selected && <Check size={12} />} Ask {persona.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-[24px] border border-white/10 bg-white/[0.05] p-2">
                  <textarea
                    aria-label="Group message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={1}
                    maxLength={10000}
                    placeholder="Message the group…"
                    className="max-h-36 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send group message"
                    disabled={!draft.trim() || sendMutation.isPending}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white disabled:opacity-40"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
                {sendMutation.isError && (
                  <p className="mt-2 text-xs text-rose-300">The group message could not be sent.</p>
                )}
              </form>
            </>
          )}
        </main>
      </div>
      {showCreate && (
        <CreateGroupDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedGroupId(id);
          }}
        />
      )}
    </div>
  );
}

function CreateGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [personaIds, setPersonaIds] = useState<number[]>([]);
  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });
  const personas = useMemo(() => personasQuery.data ?? [], [personasQuery.data]);
  const createMutation = useMutation({
    mutationFn: () => omnichatService.createGroup(name.trim(), description.trim(), personaIds),
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.groups });
      onCreated(group.id);
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnOverlayClick
      overlayClassName="bg-black/70"
      className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#181920] p-6 shadow-2xl"
      ariaLabelledBy="omnichat-create-group-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="omnichat-create-group-title" className="text-xl font-semibold text-white">
          Create a group
        </h2>
        <button
          type="button"
          aria-label="Close create group"
          onClick={onClose}
          className="p-2 text-white/50"
        >
          <X />
        </button>
      </div>
      <label className="mt-5 block text-sm text-white/65">
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
        />
      </label>
      <label className="mt-4 block text-sm text-white/65">
        Description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
          className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
        />
      </label>
      <p className="mt-5 text-sm font-medium text-white/65">
        Characters <span className="font-normal text-white/30">(up to 10)</span>
      </p>
      <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {personas.map((persona) => {
          const selected = personaIds.includes(persona.id);
          return (
            <button
              type="button"
              key={persona.id}
              onClick={() =>
                setPersonaIds((previous) =>
                  selected
                    ? previous.filter((id) => id !== persona.id)
                    : previous.length < 10
                      ? [...previous, persona.id]
                      : previous
                )
              }
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${selected ? 'border-indigo-400/45 bg-indigo-500/15' : 'border-white/8'}`}
            >
              <PersonaAvatar persona={persona} className="h-10 w-10 rounded-xl" />
              <span className="text-sm font-medium text-white">{persona.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => createMutation.mutate()}
        disabled={!name.trim() || createMutation.isPending}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {createMutation.isPending && <Loader2 size={16} className="animate-spin" />} Create group
      </button>
      {createMutation.isError && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          The group could not be created.
        </p>
      )}
    </Modal>
  );
}

export default function OmniChatGroupsPage() {
  const navigate = useNavigate();
  const onTabChange = (tab: SidebarTab) => {
    if (tab === 'discover') navigate('/omnichat');
    if (tab === 'chat') navigate('/omnichat/chat');
    if (tab === 'groups') navigate('/omnichat/groups');
    if (tab === 'create') navigate('/omnichat/create');
    if (tab === 'explore') navigate('/omnichat/explore');
    if (tab === 'characters') navigate('/omnichat/studio');
    if (tab === 'search') navigate('/omnichat?search=open');
  };
  return (
    <OmniChatShell activeTab="groups" onTabChange={onTabChange}>
      <OmniChatGroupsWorkspace />
    </OmniChatShell>
  );
}
