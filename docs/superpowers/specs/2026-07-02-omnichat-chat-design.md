# OmniChat Chat Redesign

Date: 2026-07-02
Status: Proposed
Scope: OmniChat-only flagship shell and `Chat` page redesign

## Goal

Redesign OmniChat as a standalone flagship product surface inside the existing codebase. The redesign should not inherit layout or visual constraints from the current OmniNudge shell. Instead, OmniChat should define its own shell, panel system, and interaction language so it can serve as the proof of concept for a future broader OmniNudge redesign.

This work includes:

- Renaming the conversations surface to `Chat`
- Renaming the route from `/omnichat/conversations` to `/omnichat/chat`
- Introducing a standalone OmniChat shell with a fixed top header and fixed left rail
- Rebuilding the `Chat` page as a three-column product layout with independent scrolling columns

This work does not attempt to redesign the rest of OmniNudge.

## Product Direction

OmniChat should feel like a standalone premium messaging product rather than a feature page embedded inside OmniNudge. The design should read as a flagship surface with its own rules:

- dark, high-contrast visual system
- stronger typography hierarchy
- intentional panel separation
- dense but polished list treatment
- richer persona context rail
- reusable shell and panel primitives rather than one-off page markup

The only explicit OmniNudge reference in the OmniChat shell should be the `Exit to OmniNudge` control in the top header.

## Information Architecture

### Shell

All OmniChat pages should render inside an OmniChat-owned shell.

Shell structure:

1. Fixed top OmniChat header spanning the full page width from the far left edge
2. Fixed left icon rail positioned below the header
3. Main OmniChat workspace positioned beneath the header and to the right of the rail

The top header must visually extend above the left rail rather than being pushed to the right by it.

The shell should be used across OmniChat pages so the structure is consistent between Discover, Chat, and active chat views.

### Chat Page

The `Chat` page is a desktop-first three-column workspace beneath the fixed shell.

Columns:

1. Left `Chat` directory column
2. Center active conversation column
3. Right profile/gallery context rail

All three columns scroll independently.

The page should no longer read as “a chat view with a side card.” It should read as a full messaging workspace where list, conversation, and persona context are all first-class surfaces.

## Routing and Naming

### Naming

- Use `Chat`, singular, everywhere this surface is named in the UI
- Remove `Conversations` naming from OmniChat navigation and page copy for this surface

### Route Changes

- Replace `/omnichat/conversations` with `/omnichat/chat`
- Update all navigation targets, login redirect targets, tests, and route wiring that currently reference `/omnichat/conversations`

### Existing Conversation Detail Route

The existing active thread route `/omnichat/c/:conversationId` should remain in place, but it must render the same OmniChat shell and the same three-column workspace as `/omnichat/chat`.

Route behavior:

- `/omnichat/chat` is the inbox/workspace hub route
- `/omnichat/c/:conversationId` is the deep-linked active conversation route
- both routes render the same fixed header, fixed rail, and three-column page architecture
- when a user lands on `/omnichat/c/:conversationId`, the matching chat row must render as selected in the left directory column
- when a user lands on `/omnichat/chat`, the center pane should load the user’s most recent available chat for authenticated users; if none exists, it should render the approved empty-state conversation surface

## Header Design

The top OmniChat header should be minimal, premium, and fixed.

### Left Side

- `OmniChat` wordmark/title

### Right Side

- global account/avatar trigger
- entry point for OmniChat user defaults
- room for future account/status controls
- `Exit to OmniNudge` action

### Global Defaults

The header account area should own the user’s OmniChat defaults, such as:

- default name
- default age
- default gender/profile metadata

These defaults should be global to OmniChat and distinct from per-chat settings. Per-chat settings can continue to override them inside individual conversation flows.

### Day-One Interaction

The header account/avatar trigger should open a compact account menu. That menu should contain an explicit `Defaults` entry which opens a modal dialog for editing global OmniChat defaults such as name, age, and gender/profile metadata.

This keeps the fixed header visually clean while still making the day-one settings interaction concrete and reusable.

## Left Rail Design

The OmniChat left rail should be fixed beneath the top header and remain visible while all three main columns scroll independently.

The rail is part of the OmniChat shell, not part of the `Chat` page itself.

Requirements:

- icon-led navigation treatment
- fixed position below header
- visually separated from the workspace
- does not push the top header inward

## `Chat` Directory Column

The left content column is the inbox-style directory for chats.

### Structure

- `Chat` title
- prominent primary CTA near the title
- large search field
- filter pill row
- scrollable list of chat rows

### Filters

The design should support:

- `All`
- `Unread`
- `Favorites`

These should be visually real from day one even if some behavior is initially shallow.

### Chat Rows

Each chat row should support:

- avatar
- display name
- one-line preview snippet
- timestamp
- active/selected state

The column should be denser and visually stronger than the current implementation. Rows should feel commercially polished rather than generic admin-list rows.

## Active Conversation Column

The center column is the primary work surface.

### Header

The active conversation header should include:

- persona avatar
- persona name
- optional secondary CTA pill
- right-aligned action icons for future controls

### Messages

- message stream is its own scroll container
- center pane should visually dominate the page
- message spacing should be calmer and more intentional than the current implementation

### Composer

The composer is anchored at the bottom of the center column.

Requirements:

- large rounded dock treatment
- multiline input feel
- supporting action chips or buttons
- high-emphasis send action

The composer should feel like a designed product component, not a thin footer input.

### Removed Element

The earlier disclaimer/status strip above messages is explicitly out of scope. Do not include it in the redesign.

## Profile / Gallery Context Rail

The right column is a proper context rail, not a simple persona card.

### Structure

- `Profile / Gallery` tabs
- hero media area
- persona name
- short description/tagline
- supporting metadata and actions

### Gallery Support

The rail should be designed to support multiple images/media immediately, even if the first implementation is modest.

### Design Role

This rail should feel like a premium detail panel or merchandising surface that enriches the active chat rather than a documentation sidebar.

## Visual Language

OmniChat should establish its own design language.

### Core Traits

- dark, premium, high-contrast
- stronger panel borders and separators
- larger radii
- chunkier pills and controls
- brighter accent color used intentionally
- stronger title and metadata hierarchy

### Relative to Current OmniNudge

The design should be more productized and more expressive than the current OmniNudge surfaces. It is acceptable for OmniChat to feel visually ahead of the rest of the product because it is intentionally acting as the flagship proof of concept.

## Component/System Layer

Build the redesign on top of a small OmniChat-specific UI layer rather than a single monolithic page file.

Initial primitives:

- `OmniChatShell`
- `OmniChatHeader`
- `OmniChatRail`
- `OmniChatPanel`
- `ChatListPane`
- `ChatConversationPane`
- `ChatProfilePane`
- `ChatComposer`
- `ChatListRow`
- `ChatFilterPills`

These components should be reusable enough to seed future OmniChat screens and potentially inform later OmniNudge redesign work.

## Behavior and Scroll Model

### Fixed

- top OmniChat header
- left OmniChat rail

### Independently Scrolling

- left `Chat` directory column
- center conversation column
- right profile/gallery column

This scroll model is a hard requirement for the redesign.

## Responsiveness

Desktop is the primary target for this redesign because the reference layout is desktop-first.

Mobile/tablet should still function, but the desktop shell and three-column layout should drive the architecture.

Responsive behavior should be explicit:

- mobile defaults to the center conversation pane
- the left `Chat` directory becomes a drawer opened from the OmniChat shell or conversation surface
- the right profile/gallery rail becomes a separate drawer or sheet, not a permanently visible third column
- desktop remains the source of truth for panel structure, but small-screen behavior must preserve the same information architecture rather than invent a different product model

## Data and State Expectations

The redesign should reuse existing OmniChat data sources where possible.

Expected data groupings:

- chat list data for the directory column
- active conversation data for the center pane
- persona/profile/gallery data for the right rail
- global OmniChat account defaults for the header account controls

The design intentionally separates:

- global defaults in the header shell
- per-chat overrides in individual chat settings

## Testing Expectations

Implementation should cover:

- route rename to `/omnichat/chat`
- navigation and redirect updates
- shell layout rendering for OmniChat pages
- chat list rendering and selection states
- independent scroll-region behavior at the component/layout level where testable
- preservation of existing guest/authenticated OmniChat flows after the layout change

## Success Criteria

The redesign is successful when:

1. OmniChat renders inside its own fixed shell with a full-width header above the left rail
2. `/omnichat/chat` replaces `/omnichat/conversations`
3. The `Chat` page uses a three-column desktop workspace with independent scroll regions
4. The page visually reads as a premium standalone messaging product
5. The resulting OmniChat UI is strong enough to act as a design proof of concept for future OmniNudge redesign work
