# OmniRave 3D Runtime Design Spec

**Date:** 2026-06-04

**Status:** Draft for review

**Supersedes:** This spec replaces the player-facing runtime assumptions in [2026-06-01-omnirave-design.md](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/docs/superpowers/specs/2026-06-01-omnirave-design.md) where the older document still described a looser, smaller, or less defined experience.

**Goal:** Define the approved v1 player experience for `OmniRave` as a true 3D multiplayer browser festival with real-world scale, synchronized venue events, realistic premium avatars, OmniNudge-backed identity, and no “2D canvas social page” compromises.

---

## 1. Product Summary

`OmniRave` v1 is a true 3D multiplayer social rave world.

It is not:
- a 2D canvas experience
- a lightweight embed
- a disguised chat room
- a fork of `hallucinate`

It is:
- an original OmniRave runtime
- visually premium and atmospheric first
- built around OmniNudge launch/auth
- one continuous shared festival world
- one real-time synchronized experience per venue

Core player promise:
- high-def realistic avatars
- real-life scale venues
- continuous walking between venues
- synchronized music, screens, and scheduled venue events
- no loading-room feeling when moving around the world

---

## 2. Design Pillars

### 2.1 Visual Priority

Top priority is what players can see:
- graphics
- atmosphere
- lighting
- scale
- stage identity
- believable premium avatar quality

### 2.2 Real-World Presence

Everything should feel measured like a real festival:
- real-life scale in feet and inches
- realistic avatar proportions
- realistic movement and crowd presence
- venues with physical identity instead of abstract game-room compression

### 2.3 One Shared Festival

The world is continuous:
- no venue instancing
- no hidden room shards
- no “enter new server” feeling
- only one authoritative venue state at a time per player, based on physical position in the world

### 2.4 OmniNudge Integration

OmniNudge remains the account and launch system:
- signed-in OmniNudge users enter with persistent player state
- guests enter immediately with disposable state
- guest-to-account upgrade happens in place with no forced reload

---

## 3. Runtime Model

### 3.1 World Shape

OmniRave v1 is one shared 3D festival world containing three venues:
- `Main Stage`
- `The Underground`
- `P.L.U.R.R. Partay`

The player is always in exactly one of those three venues. There is no “neutral” in-between zone from a gameplay/audio perspective.

### 3.2 Venue Membership

Venue membership is authoritative and continuous:
- the player hears only one venue at a time
- only one venue’s chat applies at a time
- only one venue’s event state applies at a time

### 3.3 Continuous Movement

Moving between venues is physical and continuous:
- no visual load transition
- no server-hop feeling
- no fullscreen transition
- no loading shell

The only venue-crossing handoff is:
- a `1-second` audio handoff
- a `1-second` bottom-right venue HUD handoff

If the player reverses before the `1-second` handoff completes:
- the transition reverses cleanly
- the original venue remains authoritative

### 3.4 Entry Surfaces

Canonical player entry:
- `omninudge.com/games/omnirave`

Rules:
- if already signed into OmniNudge there, load the player with saved OmniRave state
- if not signed in, load as guest immediately
- if entering from a direct bookmarked runtime URL, reuse saved login if valid
- otherwise load as guest

No extra auth gate appears before entering the world.

---

## 4. Scale And World Footprint

### 4.1 Measurement Standard

OmniRave v1 uses real-world scale in:
- feet
- inches

### 4.2 Main Stage Size

Working `Main Stage` target:
- about `175 feet` tall
- about `885 feet` wide
- total footprint target: `215,278 sq ft`

This footprint is intended to support about `40,000` people at a dense festival standing profile.

### 4.3 Side Venue Sizes

Working total footprint targets:
- `The Underground`: `107,639 sq ft`
- `P.L.U.R.R. Partay`: `107,639 sq ft`

These are total venue footprints, not just dance-floor rectangles.

### 4.4 Venue Height Targets

Working venue height targets:
- `Main Stage`: about `175 feet` tall
- `The Underground`: average main hall height about `32 feet`, with crown sections up to about `38 feet`
- `P.L.U.R.R. Partay`: main warehouse ceiling about `52 feet`, with some structure reaching about `60 feet`

These are intended runtime scale targets, not decorative exaggerations.

### 4.5 World Layout

Default orientation from spawn:
- player spawns at the back plaza of `Main Stage`
- player faces the stage
- `The Underground` entrance is to the left
- `P.L.U.R.R. Partay` warehouse is to the right

Outdoor hub identity:
- festival grounds plaza
- grass in the Main Stage audience field
- paved surfaces in the back plaza

Mandatory back-plaza support infrastructure:
- row of festival tents/vendors
- medical station
- blue porta-potties
- cable runs
- barricades
- equipment cases
- no litter

No ambient NPC crowd is required in v1.

---

## 5. Venue Designs

## 5.1 Main Stage

Main Stage identity:
- luxury festival spectacle
- hero silhouette based on the approved `Celestial Crown` direction
- environmental depth and VIP terrace feeling based on the approved `Garden Basin` direction
- fireworks as the venue’s headline scheduled event

VIP:
- real explorable zone in the same world
- visible to everyone
- guests blocked
- OmniNudge users allowed
- one bouncer-style access opening on each side
- no separate VIP instance

### 5.1.1 Main Stage Scheduled Event

Timing:
- every hour on the hour
- `10-second` lead-in
- `3-minute` fireworks show
- brief closing identity moment just after the 3-minute window

Countdown:
- begins `10 seconds` before the hour
- displayed above the stage like a drone-show sky formation
- first display:
  - `Fireworks begin in`
  - `10`
- then `9` through `1` as numbers only

Show structure:
- first half: luxurious and elegant
- second half: huge festival bombastic
- mostly aerial sky bursts
- also stage-level pyro throughout
- launches from the stage and surrounding side positions

Branding:
- special screen mode during the event
- includes `Main Stage + OmniRave`
- sky-written `OMNIRAVE` moments:
  - end of minute 1: drone-light spelling
  - end of minute 2: firework-letter spelling
  - end of minute 3: hybrid drone + fireworks spelling
- each is bigger than the last
- the final hybrid `OMNIRAVE` is the show’s last sky beat

Audio:
- music continues unaffected
- fireworks add their own sound
- fireworks audio is spatial and directional from the stage / behind-stage area

Player experience:
- only players currently in `Main Stage` experience the show
- `Main Stage` includes the back plaza and side entrance areas until the player crosses into another venue
- players remain fully free to move

Announcements:
- global chat announcement at `5 minutes`
- global chat announcement at `1 minute`
- exact wording:
  - `System HH:MM:SSPM: Main Stage fireworks in 5 minutes`
  - `System HH:MM:SSPM: Main Stage fireworks in 1 minute`

---

## 5.2 The Underground

Underground identity:
- abandoned old brick subway tunnel
- no explicit in-world historical references like “London” or “1863”
- hard Berlin techno, `145+ BPM`
- hostile, older, menacing
- no natural light

Layout:
- outdoor subway entrance above ground labeled `Underground`
- staircase down from Main Stage world
- one narrow platform on arrival
- dance floor is down on the abandoned tracks
- multi-track depot feel
- rails run left-to-right across the player’s view
- DJ railcar sits on the first track
- screen/speakers project from the side of the railcar toward the crowd
- open left/right tunnel darkness with fences deeper inside the tunnels

VIP:
- catwalk parallel to the tunnel and tracks
- located midway between the railcar and opposite wall
- ladders at each end
- safe during collapse event

Lighting and environment:
- red and dark orange lighting
- red and dark green lasers
- heavy fog
- crumbling unstable tunnel shell
- mostly dry/dusty floor
- some leak puddles and oily reflections

### 5.2.1 Underground Scheduled Event

Timing:
- every hour at `:30`
- no lead-in
- immediate aggressive start
- `3-minute` active event
- fast eerie recovery just beyond the main event window

Identity:
- structural collapse disaster
- no countdown
- no local chat warning
- no global chat warning
- it should feel like an accident

Effects:
- harder emergency lighting state
- heavier dust
- tunnel groans / metal strain
- intensified lasers
- major ceiling pieces falling
- side tunnel cave-ins
- railcar crushed/broken/glitched during the event
- music unaffected

Danger model:
- major impacts can hit players
- if struck by major debris:
  - very brief blackout / impact transition
  - respawn at Underground spawn
  - on-screen message: `Tunnel collapse`
- small dust/brick fragments do not trigger forced respawn
- VIP catwalk is safe from major impact hits

Floor reshaping:
- debris temporarily blocks parts of the floor
- routes change
- exit route remains open
- VIP ladders remain open
- floor stays broadly navigable with detours

Progression:
- debris intensity increases by minute
- dangerous impact frequency increases by minute
- final minute-end `OMNIRAVE` breakdown is the strongest end beat

Targeting model:
- use curated valid collapse target zones
- semi-random selection each event
- some zones are more dangerous / more likely than others
- experienced players can learn the room over time
- no guaranteed safe pockets outside VIP

Screen mode:
- switches to disaster mode
- blends industrial / ritual motion language with emergency/breakage imagery
- `OMNIRAVE` appears at the end of each minute
- each `OMNIRAVE` breaks down more aggressively than the last

Recovery:
- fast and eerie
- debris, broken railcar, and damaged tunnel phase back toward normal

---

## 5.3 P.L.U.R.R. Partay

Identity:
- hybrid of raw warehouse rave and glow-paint fantasy playground
- rooted in 90s euphoric rave culture
- positive, communal, ecstatic
- abandoned warehouse built out by local ravers

Layout:
- rectangular warehouse
- big roll-up loading door entrance
- raised platform centered on each wall
- DJ altar on the platform opposite the entrance
- other three raised platforms are VIP
- stair at both ends of every raised platform
- thin factory-style railings
- open central floor

Stage:
- DIY bright rave altar
- smileys, neon paint, fabric, glowing decor
- white folding table
- vinyl turntables
- crates of records
- speakers on stage and on floor
- every speaker is unique

Side spaces:
- `Kandi Korner`
- `Cuddle Puddle`
- opposite sides of the room

Hanging and decor language:
- smiley banners
- UV fabric strips
- glow-stick chandeliers
- suspended speakers
- disco balls
- circular peace-sign elements as supporting accents

### 5.3.1 P.L.U.R.R. Partay Scheduled Event

Timing:
- every hour at `:45`
- `15-second` lead-in
- `3-minute` active event
- `10-second` dreamy recovery

Lead-in:
- no numeric countdown
- brief light swell
- brief `PLURR` phrase cue

Identity:
- positive communal climax
- hint of psychedelic sensory overload

Physical room transformation:
- stronger UV glow
- stronger hanging-decor reactions
- light bursts
- walls visually modulate and feel wavy
- floor gains reactive glow-paint / rave-symbol patterns
- DJ altar and speaker stack glow/vibrate/pulse
- speakers visually warp and grow/shrink

Important rule:
- wall and speaker warping are purely visual
- collision remains normal

Affected subareas:
- main floor
- stage
- `Kandi Korner`
- `Cuddle Puddle`
- all VIP platforms

Subarea specifics:
- `Kandi Korner`: stronger glow, bracelet-color cascades, charm/light reactions, intensified DIY decor animation
- `Cuddle Puddle`: softer breathing color light, dreamy modulation, euphoric glow
- `VIP`: stronger view lighting, more active overhead decor, richer lounge glow

Air effects:
- strong glow confetti
- strong floating particles
- no soap bubbles
- no foam

Screen mode:
- fully special event mode
- `PLURR` appears multiple times
- `OMNIRAVE` appears at the end of each minute
- minute-end `OMNIRAVE` moments escalate
- final `OMNIRAVE` is huge, euphoric, glowing, and built from rave-symbol light, paint, and particles

Audio:
- subtle euphoric hallucinatory room-audio layer
- supports trippy altered-state feeling
- never overtakes the music

Progression:
- builds across three clear minute-by-minute phases

Recovery:
- dreamy
- `10 seconds`
- room settles down in reverse of the build-up
- screen gets a closing `PLURR / OMNIRAVE` beat at the start of recovery

Announcements:
- no chat announcements
- event is entirely local to the venue

---

## 6. Avatar System

### 6.1 Avatar Quality Target

Avatar target:
- realistic
- premium
- fashion-forward
- not Roblox
- not anime

### 6.2 Guest vs Logged-In Model

Guests:
- get a random generated avatar
- cannot edit avatar
- no persistence

Logged-in OmniNudge users:
- first join: spawn immediately with generated avatar
- can open avatar editor anytime
- one saved persistent look only

### 6.3 Generator Rules

Same generator for guests and logged-in first-time users:
- choose body base first
- choose random height between `5'0"` and `6'0"` inclusive
- choose wardrobe from that body base’s coded pool

Guests and first-time logged-in users share the same generator. The difference is only that the logged-in user can later edit and save.

### 6.4 Editable Categories

Separate top controls:
- `Male`
- `Female`
- height slider in `1-inch` increments
- valid height range: `4'0"` to `7'0"`

Normal categories:
- hair styles
- hair color
- skin tone
- shirts/tops
- jackets
- shorts/pants
- shoes / flip flops / boots

Skin tones:
- 10 options spanning broad light-to-deep range

Wardrobe counts:
- 10 options per category
- 5 traditionally girl-coded
- 5 traditionally boy-coded
- not access restricted after entry into the editor

### 6.5 Height Effects

Height affects:
- body scale
- eye level
- collision capsule / standing presence

Height does not affect:
- movement speed
- sprint speed
- jump power

### 6.6 Avatar Editor

Layout:
- top-left anchored popup
- larger than settings
- left column:
  - `Male / Female`
  - height slider
  - vertical category tabs
  - scrollable visual tile area
- right column:
  - live high-def preview avatar

Tile behavior:
- all categories use preview tiles
- tile scroll is vertical only
- no hover treatment
- strong selected-state treatment

Preview:
- own preview avatar inside the editor
- updates in real time as selections change
- left-click and drag rotates the preview `360`
- no preview zoom required in v1

Actions:
- header actions only
- order:
  - `Close`
  - `Cancel`
  - `Save`

Behavior:
- `Cancel` resets preview back to current real avatar state
- `Cancel` does not close
- `Close` closes and discards unsaved changes
- `Save` persists immediately and closes on success
- if save fails:
  - editor stays open
  - inline error appears
  - pending choices remain intact

Saved-avatar sync:
- local player sees save immediately
- other players receive the update shortly after through normal sync

Guests:
- still see the normal `Avatar` button
- clicking it opens the venue-styled auth/signup popup immediately

---

## 7. Movement, Camera, And Traversal

### 7.1 Core Feel

Movement target:
- realistic
- weighted
- grounded

Actions:
- walk
- sprint
- jump
- crouch
- ladders

No:
- mantling
- ledge grab
- fall damage
- health system
- ragdoll
- knockdown

### 7.2 Camera

Default camera:
- medium third-person

Zoom model:
- mouse wheel controls zoom
- zoom out for wider third-person
- zoom all the way in for first-person
- no separate first-person toggle button

Rules:
- first-person hides own body
- camera collision pushes inward when blocked
- camera returns to chosen zoom when space opens up
- camera and movement are independent
- movement is camera-relative
- player can look around while standing still or moving
- default camera mode is `Free Camera`
- optional setting for `Auto-Follow`

Height:
- default third-person framing scales relative to avatar height

### 7.3 Movement Behavior

Avatar:
- rotates to face movement direction while walking

Traversal:
- naturally walk off small ledges/steps
- naturally climb normal stairs
- can fall if misstepping off dangerous areas
- railings do the safety work where present

### 7.4 Sprint

Sprint:
- hold to sprint
- stamina-limited
- when stamina empties, player drops back to normal walk speed
- stamina recovers anytime the player is not sprinting
- sprint allowed in all areas
- jump while sprinting is allowed

Guests:
- cannot sprint
- still see the stamina UI and sprint affordance
- stamina bar stays full but unusable
- pressing `Shift` opens guest signup popup
- popup has `60-second` cooldown after manual close

### 7.5 Crouch

Crouch:
- default is hold-to-crouch
- settings can switch it to toggle
- crouch has no stamina cost
- crouched movement is reduced-speed movement, not immobility
- crouch can jump

### 7.6 Emotes

Emotes:
- usable regardless of camera zoom state
- loop until canceled
- same key toggles on/off
- different key switches immediately
- walking does not cancel emotes
- sprint stops emotes
- jump stops emotes
- crouch stops emotes
- manual respawn clears emotes

v1 emotes:
- right hand wave
- right hand fist pump
- running man
- rave shuffle
- two-hand hands-up bounce
- side-to-side sway
- head nod groove
- clap above head
- point to stage
- spin / twirl

### 7.7 Ladders

Ladders:
- auto-climb on contact
- approach by walking, sprinting, or jumping onto the ladder
- slower dedicated ladder speed
- can pause and stay attached
- can jump off midway
- camera behavior does not change on ladders

### 7.8 Collision

Players:
- have body collision
- cannot shove or displace each other
- can jump onto other players
- can stand on other players
- edge sliding is allowed only when contact is at the edge and the movement angle naturally permits passing around

Crowd handling:
- collision is physical
- softened slightly in dense crowds so deadlocks are less severe

Props:
- major structures are solid
- small props can be non-solid
- players do not move objects

Water:
- non-swimmable decoration only

---

## 8. Spawn, Respawn, And Venue Transition Rules

### 8.1 Spawn Points

Primary venue spawns:
- `Main Stage`: back plaza, facing stage
- `The Underground`: near the entrance/platform area, facing the railcar DJ booth
- `P.L.U.R.R. Partay`: near the entrance, facing the far-wall DJ altar

Spawn structure:
- one exact primary point
- fallback zone within `15 feet`
- fallback selection shaped to the venue geometry

### 8.2 Spawn Ghosting

Spawn ghosting applies to:
- fresh join
- manual respawn

Rules:
- if spawn area is congested, player gets temporary no-collision
- ghosting remains until the player moves clear of overlapping bodies
- no timeout
- while ghosted:
  - only walk and sprint are enabled
  - no jump
  - no crouch
  - no emotes
  - no standing on other players
- once clear, collision returns
- ghosting never reactivates later except through a new spawn/respawn

### 8.3 Respawn

Manual respawn lives in settings and:
- has no confirmation
- sends the player to the spawn of the current venue
- uses spawn ghosting if needed
- clears active emotes
- stops sprint
- clears crouch
- keeps current camera zoom
- closes all popups
- does not change chat panel open/collapsed state
- clears typed chat input text
- clears the player’s visible above-head chat bubbles

### 8.4 Venue Transition Boundaries

`Main Stage <-> Underground`:
- boundary midpoint is halfway down/up the stairs

`Main Stage <-> P.L.U.R.R. Partay`:
- boundary is the warehouse doorway threshold

Transition timing:
- `1 second`

During that second:
- player still belongs to the old venue
- old venue audio/chat/event membership persists
- old venue player counts persist
- old venue chat sends persist
- old venue system messages persist

At transition completion:
- audio handoff completes
- bottom-right venue block completes fade
- chat history clears
- `Entered [Venue]` system line appears
- new venue state becomes authoritative
- saved last-venue / respawn-venue updates

If the player reverses before completion:
- transition reverses
- old venue remains authoritative

### 8.5 UI During Venue Crossing

During the `1-second` crossing:
- movement continues
- camera continues
- chat already in focus may still send to the old venue
- most UI interactions pause until completion

Already-open windows:
- remain open unchanged through the crossing
- do not restyle mid-crossing
- only their interactive controls wait until completion

Paused until completion:
- settings/avatar button interactions
- auth button interactions
- guest restriction prompt triggers
- popup close actions
- chat scrolling
- other nonessential UI clicks

Visible behavior during crossing:
- no extra visual crossing effect beyond bottom-right fade and audio handoff
- display names remain visible
- old-venue above-head chat bubbles fade out during the second
- new-venue chat bubbles appear only after completion

---

## 9. HUD And Core UI

### 9.1 General Rules

All windows/popups are non-modal:
- no background dim
- no world pause
- no world input lock except where text fields explicitly suppress movement

Game layout is intended for real horizontal `16:9` presentation. Core HUD anchors must not overlap in intended use.

### 9.2 Top-Left Controls

Always visible:
- `Settings`
- `Avatar`

Rules:
- clicking one opens its popup below the buttons
- clicking the same button again closes it
- clicking the other swaps the popup
- buttons always stay visible

### 9.3 Top-Right Controls

Guest:
- `Log In`
- `Sign Up`

Authenticated:
- `Logout`

Logout behavior:
- first click changes label to `Confirm?`
- second click within `3 seconds` logs out
- otherwise reverts automatically
- timer is the only reset condition

### 9.4 Bottom HUD

Bottom-left:
- chat panel

Bottom-center:
- emote bar
- stamina bar integrated above it
- stamina drains right-to-left
- smooth refill

Bottom-right:
- venue block
- always visible
- order:
  - venue name
  - now playing
  - global player count
  - current venue player count

Community labels:
- `Main Stagers`
- `Undergrounders`
- `P.L.U.R.R. Partiers`

### 9.5 UI Theme System

Core HUD/UI themes:
- `Obsidian Glass`
- `Luminous Panels`
- `Hybrid Premium`

Default:
- `Luminous Panels`

Rules:
- theme applies immediately when changed
- saved for logged-in users across devices
- guest settings reset each session

Venue-styled exceptions:
- auth/signup popup
- post-auth welcome card

Those remain venue-fixed and do not follow the core UI theme selector.

### 9.6 Settings Popup

Behavior:
- top-left anchored
- immediate-apply settings
- header with title and `Close`
- closes by:
  - `Close`
  - `Esc`
  - clicking `Settings` again

Sections:
- `Camera`
- `Graphics`
- `Interface`
- `Controls`

Contents:
- `Camera Follow`: `Auto-Follow` / `Free Camera`
- `Graphics`: `Auto` plus manual `1-10` slider on row below
- `Interface`: UI theme selector, Display Names on/off
- `Controls`: crouch `Hold / Toggle`, controls help, `Respawn`

Controls help list:
- `WASD / Arrow Keys: Move`
- `Right Click + Drag: Camera`
- `Mouse Wheel: Zoom`
- `Shift: Sprint`
- `Ctrl: Crouch`
- `Space: Jump`
- `Enter: Open chat / send`
- `Shift+Enter: New line`
- `Esc: Exit chat`

No:
- account settings
- keybind remapping
- media controls
- fullscreen control
- separate render-distance control

### 9.7 Emote Bar

Emote bar:
- always shows all 10 slots
- centered at bottom
- active slot gets a moderate highlight
- icons are premium detailed pose icons
- hover shows emote name
- consistent across the game

### 9.8 Chat Panel

Chat panel:
- minimal bottom-left rectangle
- input line always visible
- full history area can collapse/fade

Open/collapse behavior:
- default open on session start when no saved user preference exists
- collapse button in top-left of panel
- adjacent chat-settings button opens `Muted Users`
- collapsing fades the history window away immediately
- input line never disappears

Collapsed behavior:
- system announcements auto-open the full window
- other players’ normal messages do not auto-open it
- player sending a message auto-opens it
- auto-open stays for `10 seconds`
- further relevant messages reset that timer
- clicking inside the chat history or scrolling makes it remain permanently open
- focusing the input field alone does not

Muted Users:
- replaces the chat history area
- simple `Back` button
- plain text rows with `Unmute`
- empty state: `No muted users`

---

## 10. Chat, Names, And Social Presence

### 10.1 Display Names

Display names:
- visible within about `15 feet`
- fixed/readable within that range
- then scale down naturally
- hard vanish around initial target `40 feet`
- follow avatar/world occlusion

Guest names:
- `GuestXXXX`

Logged-in users:
- show username only

Guests get simpler/plaintext presentation than OmniNudge users.

### 10.2 Chat Scope

Chat is venue-local only.

No:
- direct messages
- voice chat
- typing indicators
- join/leave spam
- slash commands
- blocking/reporting in v1

Mute only:
- hovering visible usernames in chat exposes mute/unmute action
- guests cannot mute others
- OmniNudge-user mutes persist across the whole game and across devices
- guest mutes are session-only

### 10.3 Chat Input

Input rules:
- `Enter` focuses chat
- `Enter` sends
- `Shift+Enter` creates new line
- `Esc` exits chat without sending
- `200-character` limit
- normal paste allowed
- `1 message per second` send rate limit
- rate-limit hint appears inside chat panel

Typing focus:
- suppresses movement keys
- right-click camera look still works

### 10.4 Chat Display

Chat log:
- persistent scrollable history for current venue session only
- clears when venue transition completes
- supports text selection/copy
- timestamps shown on every line in `12-hour` local time

Format:
- `GuestXXXX 05:34:32PM: message`
- usernames and timestamps styled differently from message body

System messages:
- same timestamped format
- visually distinct styling

On venue entry:
- fresh log includes `Entered [Venue]`

### 10.5 Above-Head Chat Bubbles

Rules:
- show message text only
- no username
- no timestamp
- support multi-line wrapping
- show up to 3 recent messages
- new message appears lowest
- older ones move upward
- fade after `5 seconds`
- world-occluded like real geometry
- partially visible if the avatar is partially visible
- fixed/readable near range, then scale down

At venue crossing:
- old-venue bubbles fade out during the `1-second` transition
- new-venue bubbles appear only after completion

At respawn:
- player’s own bubbles clear

### 10.6 Remote Players

Remote player presentation:
- one shared visible population per venue
- immediate pop-in on arrival
- immediate disappear on departure
- light smoothing/interpolation for remote movement
- prioritize smooth movement over exact pose timing
- remote jump/crouch pose may lag slightly
- full detail in v1

---

## 11. Auth, Signup, Login, And Logout

### 11.1 Auth Window

Auth uses one shared non-modal landscape window:
- opens near bottom-center
- appears as if rising from the emote HUD area
- fixed size across venues
- top-right close button
- no background dim
- clicking outside does nothing
- not closable with `Esc`

Mode behavior:
- top-right `Log In` button opens login mode
- top-right `Sign Up` button opens signup mode
- guest VIP/avatar/sprint gating opens signup mode

Field behavior:
- username field auto-focused on open
- active cursor ready immediately
- `Enter` submits
- focused auth typing suppresses movement keys
- right-click camera look still works while auth fields are focused
- switching between login/signup preserves relevant typed fields within the same open session
- closing the window discards typed fields

### 11.2 Auth Window Success

On successful login or signup:
- auth window transforms directly into the venue-styled welcome card
- top-right auth controls update immediately to `Logout`

Welcome card:
- same size and position as auth window
- non-modal
- landscape
- equal focus on:
  - `Edit Avatar`
  - `Enter VIP`
- `Edit Avatar` is clickable
- `Enter VIP` is informational only
- auto-dismisses after a few seconds with fade

If user clicks `Avatar` or similar direct top-level UI action while the welcome card is open:
- welcome card closes
- requested action proceeds

### 11.3 Guest Upgrade Rules

Brand-new signup:
- player stays where they are
- no respawn
- keeps current guest avatar
- keeps current generated height/skin/outfit
- username changes immediately to OmniNudge username
- newly unlocked powers apply immediately:
  - sprint
  - VIP access
  - avatar editing
- current venue becomes remembered venue
- current venue becomes future respawn venue

Existing account login from guest:
- player stays where they are
- no respawn
- saved account avatar loads immediately
- saved account settings load immediately
- current venue overwrites remembered venue
- current venue overwrites future respawn venue

### 11.4 Logout Rules

Logout outside VIP:
- instant in-place conversion to guest
- new guest avatar immediately
- `GuestXXXX` name immediately
- no extra message
- no welcome card

Logout in VIP:
- immediate guest conversion
- new guest avatar and guest name generated
- forced respawn to the current venue’s spawn because VIP access is lost

All logout:
- stops sprint
- closes all open windows
- remembered account venue overwritten to current venue context

---

## 12. Guest Restrictions And Upgrade Prompts

Guests are blocked from:
- sprint
- VIP access
- avatar editing
- muting other users

Prompt rules:
- VIP block opens venue-styled signup window immediately
- if player walks `15 feet` away from the VIP boundary, the window auto-closes
- if they manually close it while still nearby, it stays closed until they leave the radius and return
- same guest-block behavior applies to all VIP zones

Guest `Avatar` button:
- normal `Avatar` button is visible
- clicking it opens signup window immediately
- reopens on every click

Guest sprint:
- pressing `Shift` opens signup window immediately
- window stays until manually closed
- `60-second` cooldown after manual close

While a guest auth window is already open:
- venue crossing does not restyle it in place
- if reopened later, it uses the new current venue style

---

## 13. Media System

### 13.1 Source Model

v1 does not rely on YouTube or SoundCloud embeds for live venue playback.

Instead:
- OmniRave hosts its own curated audio files
- accepted v1 source formats: `MP3`, `WAV`
- backend controls playlists and live timelines

Reason:
- no ads
- tighter sync
- predictable looping/playback behavior

### 13.2 Playback Model

Each venue has:
- one independent looping curated playlist
- one shared live playback position for all players in that venue

Late joiners:
- hear the current live point
- do not restart from the beginning

No in-game player media controls:
- no pause
- no mute
- no volume slider

### 13.3 Stage Screens

Each venue has one main screen system in v1.

Working physical screen size targets:
- `Main Stage`: about `300 feet` wide by `100 feet` tall
- `The Underground`: about `40 feet` wide by `16 feet` tall
- `P.L.U.R.R. Partay`: about `72 feet` wide by `28 feet` tall

These screen sizes are part of the real-life scale target for the venues. The screen systems should feel physically integrated into the venue architecture rather than arbitrarily scaled UI billboards.

Screen system rules:
- modular
- reactive to current audio
- venue-specific motion language
- also carries OmniRave identity

Text display:
- HUD bottom-right `Now Playing` uses `Artist Name - Track Title`
- includes elapsed and remaining time
- stage title card at track start shows `Artist Name - Track Title`
- all players in a venue see the same screen state at the same time

#### 13.3.1 Visualizer

The screen's normal-playback content is an audio-reactive visualizer.

Reaction:
- the visualizer reacts to the ACTUAL music, not a random/decorative loop
- it is driven by live audio analysis (frequency/amplitude of the currently
  playing track), so motion tracks the real sound
- because every client plays the same self-hosted track synchronized to the
  server-owned playhead, each client's analysis yields effectively the same
  visual — satisfying "all players see the same screen state" without a
  server-pushed per-frame visual stream

OmniRave identity:
- the OmniRave logo appears on the screen at timed intervals (a periodic
  identity beat, not constant), between/over the reactive visuals

Fireworks event (Main Stage `:00`–`:03` headline window):
- during the lead-in, the screen shows an on-screen COUNTDOWN to the show
- during the event, the screen switches to a special pre-authored visualizer
  VIDEO for the fireworks (distinct from the normal reactive visualizer)

Notes captured 2026-07-22 from the product owner's earlier planning Q&A with
the Codex agent (no image mockups were produced; these are the confirmed
constraints). Exact visual style/motion language is open for implementation
within these rules and the venue's motion language above.

---

## 14. Scheduled Event Model

### 14.1 Global Clock

All venue events run from a single server-authoritative global real-time clock:
- 24/7
- even when no players are online

### 14.2 Event States

Per-venue event states:
- `none`
- `lead_in`
- `active`
- `recovery`

Flows:
- `Main Stage`: `none -> lead_in -> active -> recovery`
- `The Underground`: `none -> active -> recovery`
- `P.L.U.R.R. Partay`: `none -> lead_in -> active -> recovery`

States are internal only. No explicit HUD state labels.

### 14.3 Event Timings

Headline windows:
- `Main Stage`: `:00` to `:03`
- `The Underground`: `:30` to `:33`
- `P.L.U.R.R. Partay`: `:45` to `:48`

Hard boundaries:
- event windows are exact to the second

Post-event tails:
- local-only
- may extend beyond the 3-minute active window
- may overlap globally if needed

### 14.4 Join/Respawn During Events

If a player joins or respawns in a venue mid-event:
- they enter at the current live point of that venue’s event
- there is no player-specific divergence

This applies to:
- first entry
- returning logged-in users
- manual respawn
- forced respawn from Underground collapse

---

## 15. Persistence Model

### 15.1 Logged-In OmniNudge Users

Persist across devices:
- avatar
- current saved look
- last venue
- future respawn venue
- settings
- chat open/collapsed state
- persistent mutes

Session start rule for logged-in users:
- saved settings should be applied before the player visibly appears in-world
- no brief flash of default guest UI/state should occur first

Do not persist:
- currently open windows
- currently typed chat input
- currently open auth window

### 15.2 Guests

Guests save nothing:
- no avatar persistence
- no settings persistence
- no cross-session mute persistence
- no long-term state

Guest state resets every session.

---

## 16. Testing And Verification Targets

Implementation must be verified against these player-facing outcomes:

### 16.1 Runtime And Presence

- player launches directly into a true 3D world
- movement between venues feels continuous
- no fake “new server” transition
- world scale reads as real-life festival scale

### 16.2 Venue State

- venue membership flips only at approved boundary points
- audio and bottom-right HUD hand off over `1 second`
- chat resets only at transition completion
- reversals before completion do not commit the new venue

### 16.3 Identity And Auth

- guest, login, signup, and logout rules behave exactly as specified
- in-place upgrade works with no reload
- saved account avatar/settings load immediately on existing-account login
- brand-new signup preserves current guest avatar until edited

### 16.4 Scheduled Events

- all players in a venue see the same event state at the same time
- late joiners enter events at the current live point
- Main Stage fireworks occur exactly on the hour
- Underground collapse occurs exactly on the half hour
- P.L.U.R.R. event occurs exactly at `:45`

### 16.5 UI

- no intended HUD overlap in normal `16:9` layout
- top-left buttons always remain visible
- bottom-right venue block always remains visible
- chat, settings, avatar, auth, and welcome windows obey the non-modal rules

---

## 17. Explicit v1 Non-Goals

Not in v1:
- VR gameplay support
- voice chat
- party/friend systems
- direct messages
- NPC crowds
- furniture sitting/lying systems
- block/report moderation systems
- keybind remapping
- fullscreen control
- in-game media controls
- direct spawn into VIP
- per-device-only persistence for logged-in users
