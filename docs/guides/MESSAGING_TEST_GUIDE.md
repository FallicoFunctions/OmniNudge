# **Comprehensive Messaging System Test Guide**

This guide provides step-by-step instructions for testing all Phase 1 messaging features.

---

## **TEST ENVIRONMENT SETUP**

### **Prerequisites**
1. Backend running on `http://localhost:8080`
2. Frontend running on `http://localhost:5173`
3. Two test user accounts:
   - **User A**: `testuser1` / `password123`
   - **User B**: `testuser2` / `password123`
4. One mod mail test hub with both users as moderators

### **Browser Requirements**
- Test in Chrome, Firefox, and Safari
- Open DevTools Console to monitor WebSocket connections
- Open Network tab to inspect encryption

---

## **TEST SUITE 1: CRITICAL PATH (30 minutes)**

### **Test 1.1: Basic DM Flow**
**Objective**: Verify core messaging works end-to-end

**Steps**:
1. **Browser 1**: Log in as User A
2. **Browser 2**: Log in as User B
3. **Browser 1**: Navigate to `/messages`
4. **Browser 1**: Click "New Chat" and enter `testuser2`
5. **Browser 1**: Type "Hello from User A" and send
6. **Browser 2**: Verify message appears in real-time (< 1 second)
7. **Browser 2**: Check console for `[WebSocket] New message:` log
8. **Browser 2**: Click on conversation with User A
9. **Browser 2**: Type "Hello back from User B" and send
10. **Browser 1**: Verify message appears instantly

**Expected Results**:
- ✅ Messages appear in real-time
- ✅ No console errors
- ✅ Both users see the conversation
- ✅ Timestamps are correct
- ✅ Message order is correct

---

### **Test 1.2: Typing Indicators (DM)**
**Objective**: Verify typing indicators work for DM conversations

**Steps**:
1. **Browser 1 & 2**: Both users in same DM conversation
2. **Browser 1**: Click in message input, start typing (don't send)
3. **Browser 2**: Look for typing indicator above input: "testuser1 is typing..."
4. **Browser 1**: Stop typing for 3+ seconds
5. **Browser 2**: Verify typing indicator disappears
6. **Browser 2**: Start typing
7. **Browser 1**: Verify typing indicator appears: "testuser2 is typing..."

**Expected Results**:
- ✅ Typing indicator appears within 1 second
- ✅ Shows correct username
- ✅ Disappears after 3 seconds of inactivity
- ✅ Works bidirectionally

**Settings Test**:
1. **Browser 1**: Go to `/settings` → Disable "Typing Indicators"
2. **Browser 1**: Start typing in conversation
3. **Browser 2**: Verify NO typing indicator appears
4. **Browser 2**: Start typing
5. **Browser 1**: Verify typing indicator still does NOT appear (User A disabled it)

---

### **Test 1.3: Typing Indicators (Mod Mail) - NEW**
**Objective**: Verify typing indicators work for mod mail conversations

**Setup**:
- Create mod mail conversation with 3+ participants
- Have User A, User B, and User C all moderators

**Steps**:
1. **Browser 1 (User A)**: Open mod mail conversation
2. **Browser 2 (User B)**: Open same mod mail conversation
3. **Browser 3 (User C)**: Open same mod mail conversation
4. **Browser 1**: Start typing
5. **Browser 2 & 3**: Verify "testuser1 is typing..." appears
6. **Browser 2**: Also start typing
7. **Browser 1 & 3**: Verify "testuser2 is typing..." appears
8. When both typing: "testuser1 and testuser2 are typing"

**Expected Results**:
- ✅ All participants see typing indicators
- ✅ Multiple simultaneous typers handled correctly
- ✅ Disappears after 3 seconds

---

### **Test 1.4: Online Status**
**Objective**: Verify online/offline status tracking

**Steps**:
1. **Browser 1 (User A)**: Navigate to `/messages`
2. **Browser 2 (User B)**: Close browser completely
3. **Browser 1**: Check User B in conversation list - should show gray dot (offline)
4. **Browser 2**: Open browser, log in as User B
5. **Browser 1**: Watch for green dot to appear (< 2 seconds)
6. **Browser 1**: Check console for `[WebSocket] user_online` event

**Expected Results**:
- ✅ Offline: gray dot, "Offline" text
- ✅ Online: green dot, "Online" text
- ✅ Status updates in real-time

---

### **Test 1.5: Message Delivery Status**
**Objective**: Verify message status icons (sent/delivered/read)

**Steps**:
1. **Browser 1 (User A)**: Send message to User B (who is OFFLINE)
2. **Browser 1**: Check message shows single checkmark (Clock → Check)
3. **Browser 2 (User B)**: Log in and open conversation
4. **Browser 1**: Verify message icon changes to double checkmark (CheckCheck)
5. **Browser 2**: Stay on conversation page (messages visible)
6. **Browser 1**: Verify icon turns blue (read receipt)

**Expected Results**:
- ✅ Clock icon while sending
- ✅ Single check when sent but not delivered
- ✅ Double check (gray) when delivered
- ✅ Double check (blue) when read

**Settings Test**:
1. **Browser 2**: Go to `/settings` → Disable "Read Receipts"
2. **Browser 1**: Send new message
3. **Browser 2**: View the message
4. **Browser 1**: Verify icon stays at double check (gray), never turns blue

---

### **Test 1.6: Notification Sound**
**Objective**: Verify notification sound plays on new messages

**Steps**:
1. **Browser 2 (User B)**: Navigate to `/messages`
2. **Browser 2**: Select a DIFFERENT conversation (not User A)
3. **Browser 1 (User A)**: Send message to User B
4. **Browser 2**: Listen for notification sound (800Hz beep, 100ms)
5. **Browser 2**: Check unread badge in navigation

**Expected Results**:
- ✅ Sound plays when message received
- ✅ Sound does NOT play for own messages
- ✅ Unread counter updates

**Settings Test**:
1. **Browser 2**: Go to `/settings` → Disable "Notification Sound"
2. **Browser 1**: Send message
3. **Browser 2**: Verify NO sound plays (but message still appears)

---

### **Test 1.7: WebSocket Reconnection**
**Objective**: Verify auto-reconnect works

**Steps**:
1. **Browser 1**: Log in, navigate to `/messages`
2. **Browser 1**: Check console: `[WebSocket] Connecting...` → `[WebSocket] Initial state`
3. **Backend Terminal**: Stop backend server (Ctrl+C)
4. **Browser 1**: Check console: WebSocket error, "Reconnecting to server..." appears
5. **Browser 1**: Watch console for reconnection attempts (1s, 2s, 4s, 8s intervals)
6. **Backend Terminal**: Restart backend server
7. **Browser 1**: Verify reconnects automatically, "Reconnecting..." disappears
8. **Browser 2**: Send message to User A
9. **Browser 1**: Verify message appears (connection restored)

**Expected Results**:
- ✅ Reconnection attempts with exponential backoff
- ✅ Max backoff 30 seconds
- ✅ Auto-reconnects when server comes back
- ✅ Messages work immediately after reconnection

---

## **TEST SUITE 2: ENCRYPTION (30 minutes)**

### **Test 2.1: E2E Encryption Verification**
**Objective**: Verify messages are actually encrypted

**Steps**:
1. **Browser 1 (User A)**: Send message: "Secret message ABC123"
2. **Browser 1**: Open DevTools → Network tab
3. **Browser 1**: Find POST request to `/api/v1/messages`
4. **Browser 1**: Inspect request payload → `encrypted_content` field
5. **Browser 1**: Verify encrypted_content does NOT contain "Secret message ABC123"
6. **Browser 1**: Verify `encryption_version` is "v1"
7. **Browser 2 (User B)**: Verify message displays as "Secret message ABC123" (decrypted)

**Expected Results**:
- ✅ Network payload shows encrypted base64 string
- ✅ Plaintext never sent over network
- ✅ Recipient can decrypt and read message

---

### **Test 2.2: Media Encryption (Image)**
**Objective**: Verify images are encrypted

**Steps**:
1. **Browser 1**: Click paperclip icon in messages
2. **Browser 1**: Select a small test image (< 1MB)
3. **Browser 1**: Wait for upload progress
4. **Browser 1**: Send the image message
5. **Browser 1**: Open Network tab, find the media upload request
6. **Browser 1**: Verify `Content-Type: application/octet-stream` (not image/jpeg)
7. **Browser 2**: Verify image displays correctly (decrypted automatically)
8. **Browser 2**: Click image to open full-screen viewer
9. **Browser 2**: Verify image shows in high quality

**Expected Results**:
- ✅ Image encrypted before upload
- ✅ `media_encryption_key` and `media_encryption_iv` in message
- ✅ Image decrypts and displays correctly
- ✅ Full-screen viewer works

---

### **Test 2.3: Multi-Recipient Encryption (Mod Mail)**
**Objective**: Verify mod mail encryption works with multiple recipients

**Steps**:
1. **Setup**: Mod mail with User A, User B, User C as participants
2. **Browser 1 (User A)**: Send message: "Mod team discussion"
3. **Browser 1**: Check Network → request payload
4. **Browser 1**: Verify `is_multi_recipient: true`
5. **Browser 1**: Verify `recipient_keys` object with 3 keys (one per participant)
6. **Browser 1**: Verify `shared_encryption_iv` present
7. **Browser 2 (User B)**: Verify message decrypts and displays
8. **Browser 3 (User C)**: Verify message decrypts and displays

**Expected Results**:
- ✅ Single encrypted message with multiple recipient keys
- ✅ All participants can decrypt
- ✅ Each recipient gets their own key

---

### **Test 2.4: Sender Encrypted Copy**
**Objective**: Verify sender can read their own sent messages

**Steps**:
1. **Browser 1 (User A)**: Send message to User B
2. **Browser 1**: Refresh page (clear cache)
3. **Browser 1**: Navigate back to conversation
4. **Browser 1**: Verify sent message displays correctly
5. **Browser 1**: Check console logs for decryption

**Expected Results**:
- ✅ Sender sees their sent messages
- ✅ `sender_encrypted_content` used for decryption
- ✅ No errors in console

---

## **TEST SUITE 3: MESSAGE MANAGEMENT (20 minutes)**

### **Test 3.1: Delete Message (For Self)**
**Objective**: Verify deleting message for self only

**Steps**:
1. **Browser 1 (User A)**: Send message: "Test message to delete"
2. **Browser 1**: Hover over message → Click three-dot menu → "Delete"
3. **Browser 1**: Select "Delete for me"
4. **Browser 1**: Verify message disappears
5. **Browser 2 (User B)**: Verify message STILL VISIBLE

**Expected Results**:
- ✅ Message removed for User A
- ✅ Message still visible for User B

---

### **Test 3.2: Delete Message (For Both)**
**Objective**: Verify deleting message for both users

**Steps**:
1. **Browser 1 (User A)**: Send message: "Message to delete for both"
2. **Browser 1**: Click three-dot menu → "Delete"
3. **Browser 1**: Select "Delete for everyone"
4. **Browser 1**: Verify message disappears
5. **Browser 2 (User B)**: Verify message ALSO disappears

**Expected Results**:
- ✅ Message removed for both users
- ✅ Soft delete first, then hard delete

---

### **Test 3.3: Archive Conversation (DM)**
**Objective**: Verify per-user archiving for DM

**Steps**:
1. **Browser 1 (User A)**: Navigate to conversation with User B
2. **Browser 1**: Click "Archive" button
3. **Browser 1**: Verify conversation moves to "Archived" tab
4. **Browser 1**: Verify conversation NOT in "Active" tab
5. **Browser 2 (User B)**: Verify conversation STILL in "Active" tab (per-user)
6. **Browser 1**: Click "Archived" tab → Click "Unarchive"
7. **Browser 1**: Verify conversation back in "Active" tab

**Expected Results**:
- ✅ Archive per-user (not both)
- ✅ Archived conversations in separate tab
- ✅ Can unarchive

---

### **Test 3.4: Delete Conversation**
**Objective**: Verify conversation deletion

**Steps**:
1. **Browser 1 (User A)**: Create new conversation with User B
2. **Browser 1**: Send one message
3. **Browser 1**: Click "Delete Conversation" → Select "Delete for me"
4. **Browser 1**: Verify conversation disappears
5. **Browser 2 (User B)**: Verify conversation STILL VISIBLE
6. **Browser 2**: Send new message to User A
7. **Browser 1**: Verify conversation RE-APPEARS (re-added on new message)

**Expected Results**:
- ✅ Soft delete for user
- ✅ Re-added when new message arrives

---

## **TEST SUITE 4: MEDIA & SHARING (20 minutes)**

### **Test 4.1: Send Multiple Images**
**Objective**: Verify multi-file upload

**Steps**:
1. **Browser 1**: Click "📷+" button (multi-upload)
2. **Browser 1**: Drag and drop 3 images
3. **Browser 1**: Click "Send All"
4. **Browser 1**: Verify progress indicators
5. **Browser 2**: Verify all 3 images appear as separate messages
6. **Browser 2**: Click any image → Full-screen viewer
7. **Browser 2**: Navigate between images with arrow keys

**Expected Results**:
- ✅ All images upload
- ✅ Each image is separate message
- ✅ Full-screen viewer works

---

### **Test 4.2: Send Video**
**Objective**: Verify video messages

**Steps**:
1. **Browser 1**: Attach video file (< 25MB)
2. **Browser 1**: Send
3. **Browser 2**: Verify video player appears
4. **Browser 2**: Click play → Video plays
5. **Browser 2**: Check HLS streaming if video is large

**Expected Results**:
- ✅ Video uploads
- ✅ Video plays in-page
- ✅ Full-screen works

---

### **Test 4.3: Share Reddit Post**
**Objective**: Verify Reddit post sharing

**Steps**:
1. **Browser 1**: Navigate to any Reddit post
2. **Browser 1**: Click "Share" → Select conversation
3. **Browser 1**: Verify Reddit post preview appears in conversation
4. **Browser 2**: Verify Reddit post displays with thumbnail, title, subreddit
5. **Browser 2**: Click post → Opens Reddit post page

**Expected Results**:
- ✅ Reddit post shared correctly
- ✅ Preview shows
- ✅ Click opens post

---

## **TEST SUITE 5: PERFORMANCE (15 minutes)**

### **Test 5.1: Large Message Load**
**Objective**: Verify infinite scroll with many messages

**Setup**: Create conversation with 100+ messages (use script or send manually)

**Steps**:
1. **Browser 1**: Open conversation with 100+ messages
2. **Browser 1**: Verify only ~50 messages load initially
3. **Browser 1**: Scroll to top
4. **Browser 1**: Verify "Load more" triggers or infinite scroll loads more
5. **Browser 1**: Check DevTools Network → Verify cursor pagination used
6. **Browser 1**: Scroll through all messages - check for lag or stuttering

**Expected Results**:
- ✅ Initial load < 2 seconds
- ✅ Smooth scrolling
- ✅ Cursor pagination works
- ✅ No memory leaks

---

### **Test 5.2: Many Conversations**
**Objective**: Verify conversation list performance

**Setup**: Create 50+ conversations

**Steps**:
1. **Browser 1**: Navigate to `/messages`
2. **Browser 1**: Verify conversation list loads < 2 seconds
3. **Browser 1**: Scroll through list - check for lag
4. **Browser 1**: Use search to filter conversations
5. **Browser 1**: Verify search is instant (< 100ms)

**Expected Results**:
- ✅ List loads quickly
- ✅ Search is fast
- ✅ No UI lag

---

### **Test 5.3: Large File Upload**
**Objective**: Verify 25MB file limit

**Steps**:
1. **Browser 1**: Try to upload 26MB file
2. **Browser 1**: Verify error: "File size exceeds 25MB limit"
3. **Browser 1**: Upload 24MB file
4. **Browser 1**: Verify upload succeeds with progress bar
5. **Browser 2**: Verify file appears and can be downloaded

**Expected Results**:
- ✅ Size validation works
- ✅ Large files upload successfully
- ✅ Progress indicator shows

---

## **TEST SUITE 6: EDGE CASES (15 minutes)**

### **Test 6.1: Empty States**
**Objective**: Verify empty state UX

**Steps**:
1. **New User**: Log in with brand new account
2. Navigate to `/messages`
3. Verify empty state: "No conversations yet. Start a new chat to begin messaging."
4. Create conversation, send message, then delete conversation
5. Verify empty state returns

**Expected Results**:
- ✅ Empty state has clear message
- ✅ "New Chat" button prominent

---

### **Test 6.2: Long Messages**
**Objective**: Verify very long message handling

**Steps**:
1. Send message with 5000 characters
2. Verify message sends successfully
3. Verify message displays with proper text wrapping
4. Verify scroll works in message bubble

**Expected Results**:
- ✅ Long messages supported
- ✅ No UI breaking

---

### **Test 6.3: Special Characters**
**Objective**: Verify UTF-8 support

**Steps**:
1. Send message: "Hello 世界! 🚀 Émojis and spëcial çharacters"
2. Verify message displays correctly
3. Verify encryption/decryption preserves characters

**Expected Results**:
- ✅ All characters display correctly
- ✅ Emojis work

---

### **Test 6.4: Rapid Messages**
**Objective**: Verify handling of rapid message sending

**Steps**:
1. **Browser 1**: Send 10 messages rapidly (< 1 second apart)
2. **Browser 2**: Verify all 10 messages appear
3. **Browser 2**: Verify correct order
4. Check for duplicate messages

**Expected Results**:
- ✅ All messages delivered
- ✅ Correct order
- ✅ No duplicates

---

### **Test 6.5: Concurrent Users**
**Objective**: Verify multi-tab behavior

**Steps**:
1. Open 2 tabs as User A
2. Open conversation in both tabs
3. Send message from Tab 1
4. Verify message appears in Tab 2
5. Note: Only Tab 2 (latest) has WebSocket connection

**Expected Results**:
- ✅ Latest tab gets real-time updates
- ✅ Other tabs need refresh

---

## **TEST SUITE 7: CROSS-BROWSER (15 minutes)**

### **Test 7.1: Chrome**
Run all critical path tests in Chrome

### **Test 7.2: Firefox**
Run all critical path tests in Firefox

### **Test 7.3: Safari**
Run all critical path tests in Safari

**Expected Results**:
- ✅ All features work in all browsers
- ✅ Encryption works (Web Crypto API)
- ✅ WebSocket works

---

## **TEST SUITE 8: MOBILE RESPONSIVE (15 minutes)**

### **Test 8.1: Mobile Layout**
**Objective**: Verify mobile UI

**Steps**:
1. Open DevTools → Toggle device toolbar (iPhone 13)
2. Navigate to `/messages`
3. Verify conversation list is full-width
4. Click conversation → Verify message view replaces list
5. Verify back button returns to list
6. Send message → Verify input works on virtual keyboard

**Expected Results**:
- ✅ Mobile layout different from desktop
- ✅ Touch targets large enough (44x44px minimum)
- ✅ Virtual keyboard doesn't break layout

---

### **Test 8.2: Mobile Message Reactions**
**Objective**: Verify mobile reaction UX (no hover required)

**Steps**:
1. Open DevTools device toolbar (iPhone 13 or Pixel 7 profile)
2. Open a conversation with existing reactions
3. Tap a reaction pill on a message
4. Verify a bottom-sheet details modal opens
5. Verify the modal shows usernames who reacted
6. Tap **React with this emoji** or **Remove your reaction**
7. Verify count updates and modal closes
8. Re-open modal and close via backdrop tap

**Expected Results**:
- ✅ Tapping a reaction opens details on mobile
- ✅ User list is visible without hover
- ✅ React/remove action works from modal
- ✅ Modal closes via button/backdrop

---

## **AUTOMATED TEST COVERAGE**

### **Unit Tests Needed**
These should run in a browser environment (not Node):

1. **Encryption Utils** (`encryption.test.ts`):
   - ✅ Key generation
   - ✅ RSA encryption/decryption
   - ✅ AES file encryption
   - ✅ Multi-recipient encryption
   - ✅ Base64 encoding/decoding

2. **WebSocket Context**:
   - Connection/disconnection
   - Message handling
   - Deduplication
   - Typing indicator logic

3. **Messaging Service**:
   - API calls
   - Encryption flow
   - Error handling

### **Integration Tests Needed**
Using Playwright or Cypress:

1. Two-user messaging flow
2. Real-time delivery
3. Encryption end-to-end
4. WebSocket reconnection

---

## **PINNING TESTS (FEATURE 2)**

### **Test P1: Pin Message from Menu**
**Objective**: Verify users can pin a message and it appears in pinned bar immediately.

**Steps**:
1. Open `/messages` and select a conversation.
2. Open the message options menu (`...`) on a non-pinned message.
3. Click **Pin message**.
4. Verify pinned badge appears on the message.
5. Verify message appears in the pinned bar above the timeline.

**Expected Results**:
- ✅ Pin action succeeds without page refresh
- ✅ Pinned badge appears in-thread
- ✅ Pinned bar updates immediately

### **Test P2: Unpin Permissions**
**Objective**: Verify only the pinner or admin can unpin.

**Steps**:
1. User A pins a message.
2. User B (non-admin) opens same message menu.
3. Verify unpin action is disabled/unavailable for User B.
4. User A (or admin) unpins the message.

**Expected Results**:
- ✅ Unauthorized user cannot unpin
- ✅ Pinner/admin can unpin
- ✅ Pinned bar removes message immediately

### **Test P3: Real-Time Pin Sync**
**Objective**: Verify pin/unpin websocket updates in other clients.

**Steps**:
1. Open same conversation in Browser 1 and Browser 2.
2. In Browser 1, pin a message.
3. Verify Browser 2 pinned bar updates without refresh.
4. In Browser 1, unpin the same message.
5. Verify Browser 2 pinned bar removes it without refresh.

**Expected Results**:
- ✅ `message_pinned` and `message_unpinned` events reflected in UI
- ✅ Pinned order remains stable (oldest pin first)

### **Test P4: Pin Limit (10)**
**Objective**: Verify pin cap enforcement and cache rollback.

**Steps**:
1. Pin 10 messages in one conversation.
2. Attempt to pin an 11th message.

**Expected Results**:
- ✅ API returns conflict for 11th pin
- ✅ UI does not retain failed optimistic 11th pin
- ✅ Pinned bar remains at 10 items

---

## **ACCEPTANCE CRITERIA**

Phase 1 messaging is **PRODUCTION READY** when:

- ✅ All Test Suite 1 (Critical Path) tests pass
- ✅ All Test Suite 2 (Encryption) tests pass
- ✅ All Test Suite 3 (Message Management) tests pass
- ✅ No console errors during testing
- ✅ WebSocket reconnection works reliably
- ✅ All 3 browsers supported
- ✅ Mobile responsive works
- ⚠️ Unit tests pass (when run in browser environment)

**Current Status**: ~95% complete
- ✅ Typing indicators for mod mail: FIXED (just implemented)
- ⚠️ Automated encryption tests: Need browser environment
- ✅ All other features: Working

---

## **KNOWN LIMITATIONS**

1. **Multi-tab WebSocket**: Only latest tab gets real-time updates (acceptable)
2. **Private Key Storage**: localStorage (acceptable for Phase 1, improve in Phase 2)
3. **No Edit Messages**: Out of scope for Phase 1
4. **No Message Search**: Out of scope for Phase 1

---

## **TROUBLESHOOTING**

### **WebSocket Won't Connect**
- Check token in localStorage AND sessionStorage
- Verify backend WebSocket endpoint running
- Check browser console for errors
- Verify CORS configuration

### **Messages Not Encrypted**
- Check if recipient has public key set up
- DMs fall back to plaintext if no key
- Mod mail REJECTS plaintext

### **Typing Indicators Don't Work**
- Check if setting is enabled in `/settings`
- Verify WebSocket connection active
- For mod mail: verify participants list loaded

### **Images Don't Display**
- Check if media URL correct
- Verify encryption keys present
- Check browser console for decryption errors

---

**Total Testing Time**: ~2-3 hours for complete manual test suite
**Quick Smoke Test**: ~15 minutes (Suite 1 only)
