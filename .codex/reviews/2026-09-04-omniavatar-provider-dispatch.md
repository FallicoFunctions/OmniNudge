# OmniAvatar provider-dispatch outbox review

Scope: provider-neutral reconstruction dispatch creation, validation, atomic job/outbox persistence, dispatch leasing, bounded failure retries, submission recording, pending cancellation, migration 113, and the repository truncation guard regression exposed during implementation.

Controlled inputs: one valid six-view owner-matched reconstruction command and one cross-owner command; one successful provider submission and one five-failure terminal route; complete tool output and source text containing truncation phrases.

Process/build stamps: fresh Go test processes; PostgreSQL isolated schemas created by the integration test; no provider executable, network upload, paid call, Blender process, or warm application server is credited.

Review status: Pass 1 in progress. The pass is not terminating evidence until every protocol instrument is recorded below and the ledger validator accepts it.
