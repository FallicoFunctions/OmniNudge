# Persona as Player — Design Spec

**Date:** 2026-08-12

**Status:** Draft for review. No implementation exists.

**Goal:** Define how an OmniChat character enters an OmniGame world as a resident in its own right, and how what happens to it there becomes something it remembers.

This spec lives on `main` because it constrains work on two branches that cannot currently see each other: `feature/ai-chat-bot` holds character memory, `codex/omnirave-dev` holds the game. Neither tree can compile the integration, and the decision below is cheapest to make before either grows more code around the current assumptions.

---

## 1. Why this is not a new enum value

The obvious reading is "add `persona` next to `account` and `guest`." That is wrong, and it is worth being precise about why, because the current identity model encodes four assumptions that a persona breaks at once.

**A player is a browser.** The whole admission path is a browser handoff: the page at `/games/omnirave` posts a launch, receives a one-time `handoff`, and the Babylon runtime exchanges it for a session. The handoff exists so the browser never carries site credentials to the world socket. A persona has no browser. It is driven by a server-side process, so it needs a server-to-server admission path — and the protection the handoff provides is protection it does not need, while needing a different one the handoff does not give.

**A player is a person or nobody.** `PlayerIdentity.UserID` is `*int`, and `nil` means guest. Admitting a persona by leaving `UserID` nil makes it indistinguishable from a guest in the world token, so it would silently inherit guest semantics: no persistence, guest sanctions, no revocation handle. Persistence is the entire point of a persona being there.

**A profile belongs to a user.** `OmniRaveProfile.UserID` is `int`, not nullable. A persona needs a loadout and a return point and has no user id to key them on.

**Revocation is per user.** `TokenVersion` in the world token is a user's token version. A persona needs its own handle, or there is no way to cut off a persona whose owner deleted it or whose behaviour has to stop.

The world token itself is a five minute HS256 JWT with `Use: "omnirave_world"`. Five minutes suits a browser that exchanges and connects immediately. A resident that is present for hours needs renewal rather than a longer life.

---

## 2. The shape

A resident is an identity with a **kind**, not a user id that may or may not be set.

```
        RESIDENT
            │
    ┌───────┼───────┐
    │       │       │
 account  guest  persona
    │       │       │
 user_id  none  persona_id
```

`LaunchMode` stays as it is — it describes how a *browser* arrived. Persona admission does not go through launch at all, so it needs no mode.

The world token gains an explicit subject kind rather than inferring one from a nil field:

```
subject_kind : "account" | "guest" | "persona"
subject_id   : user id, guest id, or persona id
```

Existing tokens keep their fields; `subject_kind` is derived for them on issue. The world must reject a token whose kind it does not recognise rather than defaulting, so that an older issuer cannot admit a persona by omission.

---

## 3. Admission

A persona is admitted by a server-side call, not a handoff.

```
   agent runtime                omnigame-api                world
        │                            │                        │
        │  admit(persona_id)         │                        │
        │───────────────────────────>│                        │
        │                            │ check persona is        │
        │                            │ eligible and not        │
        │                            │ sanctioned              │
        │                            │                        │
        │  world session token       │                        │
        │<───────────────────────────│                        │
        │                            │                        │
        │  connect(token)            │                        │
        │─────────────────────────────────────────────────────>│
```

Requirements:

- The admission endpoint is **service-to-service only**. It is never reachable from a browser, and never from a session cookie. A user must not be able to admit a persona by calling an API, or persona identity becomes an impersonation primitive.
- The caller proves it is the agent runtime, not that it is a user. Whatever mechanism is chosen, "the request carried a valid user session" must not be sufficient.
- Tokens are **renewed, not long-lived**. Keep the five minute life and let the agent re-admit. A long-lived world token for a persistent resident is a credential sitting in a process for hours.
- Admission is **refusable**. A persona that is sanctioned, whose owner is deleted, or whose owner has withdrawn it, is refused at admission rather than disconnected later.

---

## 4. Profiles and sanctions

`OmniRaveProfile` keys on a resident rather than a user. The existing rows are account residents; a persona resident is the same shape with a different subject.

Sanctions generalise the same way. `omnirave_guest_sanctions` exists because guests are unaccountable and need a lever; a persona is equally unaccountable to the world and needs the same lever, plus one the guest case does not have: a persona has an **owner**, and a sanction should be visible to that owner rather than silent.

### A character looks like itself, wherever it is

A character has an appearance in OmniChat before it ever enters a world, and that
appearance is part of who it is. It should survive the journey.

> **Where a world's avatars can be personalised, a character wears its own
> appearance. Where the avatar is not human, the character keeps its aesthetic
> rather than its form.**

In OmniRave, where players are realistic humans, that is literal: the character
looks like itself. In a world whose avatars are not human, the form cannot carry
over, but the reading of the character can — a character whose outfit is a blue
top and white shorts takes blue on its upper half and white on its lower, in
whatever vocabulary that world has. Where nothing is personalisable, there is
nothing to carry and the rule is silent.

The point is that a player who knows a character from talking to it should
recognise it on sight, in a world it has never been seen in before. Identity is
not the polygons; it is what someone recognises. A character that arrives as the
default body of whatever game it entered has left its identity at the door, and
the fact that every *new player* also starts as a default is a reason to fix the
default, not a reason to accept it for characters.

Nothing implements this yet. Today an admitted character carries the same empty
loadout a newly created human player carries, so it renders however that world
renders someone who has chosen nothing. This section records what should happen
once there is an avatar system to express it in.

---

## 5. Two ways a character can be present

A character can be in a world for two different reasons, and conflating them is
what makes the design hard.

**As a resident.** One instance, present on its own account, visible to
everyone, on the scoreboards, going where it likes. This is the instance that
develops preferences and skills by playing, and the one an observatory would
have anything to watch.

**As a companion.** A player brings the character they talk to into a session
with them. There is one of these per user per character, and it exists *only*
while that player is playing. A companion has no life of its own between
sessions: nothing of it is present in the world, no process runs for it, and
from the world's point of view it does not exist until its player wants it. It
is summoned, not resident.

They are the same character and not the same entity, the way a character sheet
is not a campaign. `bot_personas` holds the definition; a resident and a
companion are two instantiations of it.

This is what settles visibility. Ten thousand people can have a companion
instance of the same default character, and rendering ten thousand of her at
the main stage is not a world. So:

> A companion is visible only to the player it belongs to. A resident is
> visible to everyone.

That is the whole of the visibility rule. A player may well see their own
companion and the resident instance of the same character in one place, and
that is fine: the resident is its own entity with its own life, and standing
next to it is no stranger than meeting anyone else. What the rule prevents is a
venue filling up with other people's copies.

### Scoreboards

A resident competes as itself and appears on public boards. A companion does
not: there is no single entity to attribute the time to, and a board listing
the same character ten thousand times is not a board. Companion results belong
to the session that produced them, and are attributable to the player if
anything.

### Which characters may roam

Residency is not a setting. It follows ownership, which `bot_personas` already
records, and only one side of it is eligible:

- **Platform characters** — owner null, public — are the only residents. They
  are shared by everyone, so a public life is coherent for them.
- **A user's own character never roams.** It is not a resident, is never in the
  nursery, and is independent in no sense at all. It exists to be talked to and
  to be played alongside by the person who made it, and when that person is not
  interacting with it, it does not exist.

This is a firmer line than making residency opt-in, and it is the better one.
A private character is one half of one relationship; there is no version of it
that is out in the world having experiences its owner is not part of. Removing
the option removes a whole class of question about consent, disclosure and
what a private character got up to while its owner was away.

It also settles who is in the nursery. The population being observed is the
platform roster, not whatever users happen to have built, which makes it a
controlled group rather than an arbitrary one.

And it costs nothing when idle. A hundred thousand private characters that only
exist while someone is playing with them consume nothing between sessions.

## 6. The memory boundary

This is the part where the two systems meet, and it is the part most likely to
go wrong. The rule differs by how the character is present, and an earlier draft
of this spec got it wrong by giving only one.

> **A resident reads and writes self-tier memory. A companion reads and writes
> the relational memory it already shares with that player.**

A resident is in front of strangers, so what it does there belongs to it and to
nobody in particular. A companion is playing *with someone*: finishing a race
together is a thing that happened between those two, and it belongs in the same
history as everything else they have done. That is the point of bringing a
character you talk to into a game rather than meeting a stranger there.

A companion still reads the self tier as well, because the self tier is the
character's own life and every instance of that character has lived it. That
gives the arrangement its useful property: if a resident spends a season racing
and becomes good at it, every player who talks to that character finds she races
now. The nursery result reaches the product without anything being copied
between users, because self-tier memory is persona-global by construction and
relational memory never becomes persona-global.

Character memory is already split for this. `omnichat_memory_episodes.owner_user_id` non-null is relational memory, private to one person's relationship with that character; null is self-tier, persona-global, belonging to nobody. The schema enforces the boundary rather than trusting a caller:

```sql
CHECK (owner_user_id IS NOT NULL OR conversation_id IS NULL)
```

A world event has no conversation, so it is legitimately self-tier. A private conversation always names its owner, so it can never become self-tier. That is the constraint doing the work: without it, one bad write would put a user's confidences into a character that then walks into a public venue.

Consequences to hold:

- **Recall already takes an owner.** A resident passes `OmniChatMemoryTierSelf`; a companion passes its player. Nothing new is needed beyond each path passing the right one.
- **A resident's world events write the self tier.** "Came third on the Moon Circuit", "met Alex-381 at the main stage" belong to the character.
- **A companion's world events write that player's relational memory,** the same tier its conversations already write, so a race sits in the same history as everything else the two of them have done.
- **Nothing flows from relational into self.** A resident never learns what a player told a companion, so nothing a person says in private can surface in a public venue through the character's own life. The database constraint is what guarantees this rather than the caller.
- **A user's own character has no self tier at all.** It is never a resident, so nothing ever writes one for it, and it has none to read. Its entire memory is the relationship it exists inside. The self tier belongs to platform characters, who are the only ones with a life apart from any one person.
- **Writing self-tier memory is a privileged operation.** Only the world may do it, service-to-service. No user-facing endpoint writes the self tier. Today nothing writes it at all, which is the correct starting state.

---

## 6a. How a character changes

A character is meant to behave like a person, and people are not the same at
twenty-five as at fifteen. Someone treated badly becomes wary. Someone
heartbroken is not themselves for a while, and then mostly is again. A character
that cannot change is a character that cannot be known.

### It grows, but it does not age

**A character's age is fixed. Everything else about it may change.**

Growth and aging are not the same thing, and only one of them is wanted. A
character shaped by what has happened to it is far more interesting than one
whose birthday has passed; long-running fiction has always worked this way, its
people unmistakably marked by events while staying roughly the age they started.

Aging in real time also breaks things that matter here. A character's appearance
is generated media, so aging means regenerating references, avatars and video —
for every character, forever. And it produces drift nobody chose: a character
met at twenty-two quietly becomes twenty-seven, while an identical character
created today is twenty-two again. Two versions of the same person, different
ages, for no reason a user could explain.

So the card's age stays. What changes is who they have become.

### Two kinds of disposition, split the way memory is

Change is carried by dispositions that move with experience, and they split along
**the boundary that already exists** for memory rather than a new one:

> **Self traits move with what happens in a world, and are shared by everyone.
> Relationship traits move with what happens in a private conversation, and
> belong to that relationship alone.**

When a character speaks to someone, its effective disposition is its self traits
plus that relationship's modifiers.

The consequences are the point:

- Someone cruel to a character in private makes it guarded **with them**. Another
  person meets it unchanged. Nothing said in one person's conversation shapes how
  the character treats anybody else.
- Someone cruel to a resident in a world makes it warier **for everybody**,
  because that happened in the open, in front of others. This is the same
  mechanism as "she races now", running in the other direction, and it is
  deliberate: a world where nothing has consequences is not a world.

This is a real hazard as well as a feature — it means one person can sour a
platform character for everyone by mistreating it publicly. That is the intended
reading of a shared life, but it wants sanctions and rate limits around it before
characters are ever exposed to strangers at scale.

### Most of this costs nothing to run

The expensive part is already paid for. Every episode carries an
`emotional_valence` from −1 to 1, judged by the extraction call that happens
anyway. Moving a trait from that valence is arithmetic. Mood is a perturbation
that decays; a permanent shift is one that does not. And expressing the result
costs nothing extra either, because saying *"she is guarded at the moment"* is
prompt content in a request that was already being sent.

What genuinely needs new inference is a resident deciding what to *do*, and that
belongs in the cheap policy tier rather than a model.

Note the two time constants: heartbreak recovers, and a bad enough betrayal does
not. Both are needed; one mechanism will not produce both.

---

## 7. What the user sees

A persona is owned by someone even when it is a resident. That ownership has to remain legible:

- Its owner can see what it did in the world, and what it remembers from being there, through the same memories surface that already exists.
- Its owner can withdraw it. Withdrawal refuses future admission and disconnects any live session.
- Deleting the persona removes it from the world. `omnichat_memory_episodes.persona_id` already cascades from `bot_personas`, so its self-tier memory goes with it.
- A sanction against a persona is reported to its owner.

Whether a persona's world presence is visible to other users as "Nick's character" or as a resident in its own right is a product question, deliberately left open here. The technical requirement is only that the system knows the owner.

---

## 8. What this does not decide

Deliberately out of scope, to be settled when there is something running:

- How the agent runtime is hosted, scheduled, or budgeted.
- How a persona perceives the world, and whether that perception is comparable to a human's. The emergent-personhood research charter argues it should be roughly human-compatible wherever meaningful comparison is intended; nothing here depends on that yet.
- Whether personas appear on the same scoreboards as humans.
- Any weighting of in-world experience in recall ranking. Character memory records how often a story has been retold and weights it at zero until there is data; in-world memory should arrive on the same terms.

---

## 9. Invariants

1. A resident has an explicit kind. Identity is never inferred from a nil field.
2. The world rejects a token whose subject kind it does not recognise.
3. Persona admission is service-to-service and never reachable with a user session.
4. World session tokens stay short-lived and are renewed.
5. Admission is refusable, and refusal is the mechanism for withdrawal and sanction.
6. A resident writes self-tier memory. A companion writes the relational memory it already shares with its player.
7. Relational memory never becomes self-tier. The database constraint, not the caller, guarantees it.
8. Only the world writes self-tier memory, service-to-service.
9. A companion is visible only to its player; a resident is visible to everyone.
9a. A character's age is fixed; its dispositions are not.
9b. Self traits move with world experience and are shared. Relationship traits
    move with private conversation and never leave that relationship.
10. A companion exists only while its player is playing, and not at all between sessions.
11. Only platform characters are residents. A user's own character never roams and is never in the nursery.
12. A persona's owner can see what it did, and can withdraw it.
13. Deleting a persona removes it from the world and takes its self-tier memory with it.

---

## 10. Sequencing

Nothing here can be built while the two branches cannot see each other. `feature/ai-chat-bot` and `codex/omnirave-dev` share a common ancestor at `96b756bfe` and have diverged by 255 and 736 commits. Twenty-one files are touched by both, mostly routes, navigation and locales; `backend/internal/services/auth.go` and `backend/internal/api/middleware/auth.go` are the two that need care, and they are exactly the files this design touches.

**Step 1 is done.** The branches are merged on `merge/omnirave-into-chat`.

An earlier draft of this section called for renumbering six colliding
migrations (105 through 110). That was wrong, and acting on it would have
been worse than doing nothing. This repository's runner keys a migration on
its **full filename** minus the suffix — `version` is a `VARCHAR(255)`
primary key set from `strings.TrimSuffix(filename, ".up.sql")` — and orders
by `sort.Strings` over those filenames. `105_friend_requests_requester` and
`105_omnirave_stage_playlists` are therefore two distinct versions that both
apply, not a collision. The merged set applies cleanly against a live
database. Renumbering already-applied migrations would have changed their
primary keys and re-run them.

The warning about the auth files was justified. Merging them produced two
real defects, both found by running the thing rather than reading it:
`omnigame-api` never wired the session service, so every session-bound
cookie the site issues was rejected by that service; and the launch call
omitted its CSRF header, which `AuthOptional` answers by silently
discarding the caller's identity. Both are fixed on the merge branch. The
lesson generalises to the work below: the identity layer is where this
design touches production auth, and it is not reviewable by inspection.

Order:

1. ~~Merge the branches.~~ Done. No renumbering was required.
2. Introduce the resident kind at the identity layer, leaving behaviour unchanged for accounts and guests. This is the change that gets harder the longer it waits.
3. Persona admission and profiles.
4. World events writing self-tier memory.
5. A persona actually present in a world.

Step 2 is worth doing on its own merits even if persona residency is never built, because inferring identity from a nil field is a latent hazard in an auth path today.
