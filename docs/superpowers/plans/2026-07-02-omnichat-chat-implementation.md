# OmniChat Chat Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone OmniChat shell and flagship `Chat` workspace, rename the route to `/omnichat/chat`, and apply the new shell across OmniChat pages.

**Architecture:** Introduce OmniChat-owned shell primitives instead of page-local layout code, then move Discover and Chat/detail routes onto that shell. Use a shared chat workspace component for both `/omnichat/chat` and `/omnichat/c/:conversationId`, keep the top toolbar fixed above the collapsible OmniChat sidebar, and make the three workspace columns scroll independently. Persist guest defaults locally only as a fallback, but store signed-in OmniChat global defaults through the existing `/settings` backend so the account control is not client-only debt.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Tailwind utility classes, Vitest, Testing Library, existing OmniChat API/backend.

---

### Task 1: Lock route rename and shell component boundaries

**Files:**
- Create: `frontend/src/components/omnichat/OmniChatShell.tsx`
- Create: `frontend/src/components/omnichat/OmniChatHeader.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/omnichat/OmniChatSidebar.tsx`
- Test: `frontend/src/pages/__tests__/OmniChatConversationsPage.test.tsx`

- [ ] **Step 1: Write the failing route test expectations**

Add expectations so the renamed page mounts at `/omnichat/chat` and the old `/omnichat/conversations` path is no longer the primary route under test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/pages/__tests__/OmniChatConversationsPage.test.tsx`
Expected: FAIL because test paths and labels still target `conversations`.

- [ ] **Step 3: Implement shell boundary and route rename**

Create shell/header primitives, rename sidebar tab ids from `conversations` to `chat`, and wire `/omnichat/chat` in `frontend/src/App.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/pages/__tests__/OmniChatConversationsPage.test.tsx`
Expected: PASS with `/omnichat/chat` route behavior.

### Task 2: Add OmniChat global defaults persistence and header account controls

**Files:**
- Create: `frontend/src/utils/omnichatDefaults.ts`
- Create: `frontend/src/components/omnichat/OmniChatDefaultsModal.tsx`
- Modify: `frontend/src/components/omnichat/OmniChatHeader.tsx`
- Modify: `frontend/src/components/omnichat/OmniChatShell.tsx`
- Modify: `frontend/src/pages/OmniChatPage.tsx`
- Modify: `frontend/src/services/omnichatService.ts`
- Modify: `frontend/src/services/userSettingsService.ts`
- Modify: `frontend/src/types/theme.ts`
- Modify: `frontend/src/types/omnichat.ts`
- Modify: `backend/internal/models/user_settings.go`
- Modify: `backend/internal/handlers/settings.go`
- Modify: `backend/internal/handlers/settings_test.go`
- Create: `backend/internal/database/migrations/20260702_add_omnichat_default_identity_to_user_settings.up.sql`
- Create: `backend/internal/database/migrations/20260702_add_omnichat_default_identity_to_user_settings.down.sql`
- Test: `frontend/src/utils/__tests__/omnichatDefaults.test.ts`

- [ ] **Step 1: Write the failing defaults-storage tests**

Add tests for guest local fallback behavior and signed-in `/settings` mapping for OmniChat default identity values.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/utils/__tests__/omnichatDefaults.test.ts`
Expected: FAIL because storage helpers do not exist.

- [ ] **Step 3: Implement defaults persistence and account/defaults modal**

Persist guest defaults in localStorage only when no authenticated user is available, expose a `Defaults` entry from the header account menu, add OmniChat default identity fields to `user_settings`, and pass resolved defaults into new conversation creation flows when no per-chat override exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/utils/__tests__/omnichatDefaults.test.ts`
Expected: PASS.

### Task 3: Move Discover onto the standalone OmniChat shell

**Files:**
- Modify: `frontend/src/pages/OmniChatDiscoverPage.tsx`
- Modify: `frontend/src/components/omnichat/OmniChatShell.tsx`
- Modify: `frontend/src/styles/omnichat-theme.css`
- Test: existing Discover behavior via build and route smoke coverage

- [ ] **Step 1: Refactor Discover to use the shared shell**

Remove the page-local header/sidebar structure and render Discover content inside the shared fixed header and fixed rail shell.

- [ ] **Step 2: Verify the shell layout compiles**

Run: `npm run build`
Expected: PASS with Discover using the new shell.

### Task 4: Rebuild the `Chat` page as the three-column workspace

**Files:**
- Create: `frontend/src/pages/OmniChatChatPage.tsx`
- Create: `frontend/src/components/omnichat/ChatListPane.tsx`
- Create: `frontend/src/components/omnichat/ChatConversationPane.tsx`
- Create: `frontend/src/components/omnichat/ChatProfilePane.tsx`
- Create: `frontend/src/components/omnichat/ChatComposer.tsx`
- Modify: `frontend/src/pages/OmniChatPage.tsx`
- Modify: `frontend/src/pages/OmniChatConversationsPage.tsx` or replace usage
- Modify: `frontend/src/components/omnichat/ChatSettingsModal.tsx`
- Modify: `frontend/src/components/omnichat/OmniChatSidebar.tsx`
- Test: `frontend/src/pages/__tests__/OmniChatConversationsPage.test.tsx`

- [ ] **Step 1: Write/update failing page tests for `Chat` labels and route targets**

Update the renamed page tests so they assert `Chat` copy, `/omnichat/chat`, and expected search navigation semantics.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/pages/__tests__/OmniChatConversationsPage.test.tsx`
Expected: FAIL until the renamed page and layout exist.

- [ ] **Step 3: Implement the three-column workspace**

Build the left inbox pane, center conversation pane, and right profile/gallery pane with independent scroll containers, restore the collapsible OmniChat sidebar instead of the narrow icon rail, remove the unauthenticated chat-list blocker, and tighten typography/control sizing across the shell so the page tracks the reference density instead of the current oversized feel.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/pages/__tests__/OmniChatConversationsPage.test.tsx`
Expected: PASS.

### Task 5: Regression verification and polish

**Files:**
- Modify: `frontend/public/locales/en.json`
- Modify: `frontend/public/locales/ar.json`
- Modify: `frontend/public/locales/es.json`
- Modify: any touched OmniChat page/component files
- Test: `frontend/src/utils/__tests__/omnichatGuestStorage.test.ts`
- Test: `frontend/src/utils/__tests__/omnichatDefaults.test.ts`
- Test: `frontend/src/pages/__tests__/OmniChatConversationsPage.test.tsx`

- [ ] **Step 1: Fill missing copy and rename strings**

Ensure `Chat` naming and new header/defaults labels exist in all locale files.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- --run src/utils/__tests__/omnichatGuestStorage.test.ts src/utils/__tests__/omnichatDefaults.test.ts src/pages/__tests__/OmniChatConversationsPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run full frontend verification**

Run: `npm run build && npm run i18n:verify`
Expected: PASS.
