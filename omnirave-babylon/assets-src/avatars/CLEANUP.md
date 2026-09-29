# Avatar asset cleanup — 2026-09-05

The user authorized deletion of redundant backups and failed intermediate model work. This is a storage/source consolidation, not a likeness approval or gameplay change.

## Retained authoring inputs

- `modular-v1/avatar-modular-v1.blend`: original shared body/rig and wardrobe source.
- `modular-v1/lean-v1/`, `fashion-v2/`, and `fashion-v18/`: authoring sources for the retained legacy profile endpoints. V18 is the frozen editorial endpoint; intermediate V3–V17 binary models and exports were removed.
- `omniavatar-v2/OA_male_luxury_v1.blend` and `OA_female_plurr_v1.blend`: canonical sources used by the existing jobs/runtime contracts.
- `omniavatar-v2/OA_male_luxury_v2_work.blend`: original normalized conformance scene; raw provider results and ledgers remain in `tripo-benchmark/`.
- `astra-male-proof/study04.blend`, `pose04.blend`, `fit05.blend`, `curl18.blend`, and `face19.blend`: measurement source, facial controls, groom control, and current combined candidate.
- All original/reference turnarounds, public runtime assets, build reports, failure screenshots, and code outside the local experiment remain.

## Removed material

The deletion ledger lists 67 binary files with original sizes and SHA-256 hashes: Blender autosave backups, superseded Astra checkpoints, quarantined reconstruction intermediates, and obsolete editorial V3–V17 models/exports. It is at the repository-relative `.codex/cleanup/2026-09-05-cleanup-ledger.json`.

Small historical captures/reports remain at their original paths. References in those historical records to removed binaries document past work; they are not current rebuild inputs. The quarantine rules still reject those historical filenames if they reappear. Failed models were not repackaged as accepted assets.

## Current local rebuild

Use `scripts/astra-male-proof/rebuild_current.py`, starting from the retained `fit05.blend` and the recorded facial pose/hair-guide JSON inputs. It creates the undercoat, groom, and lower-face adjustment in memory, without saving failed intermediate checkpoints. It refuses to overwrite an existing output.

The output must end in `.blend`; the optional render must end in `.png`. Files are staged beside their destinations and published only after saving and optional rendering succeed. Publication refuses files created by another writer during the rebuild. Ordinary failures remove this run's staged files and published links. A forced process kill can leave complete outputs or hidden `.avatar-rebuild-*` staging files; inspect those files before retrying. Publication is atomic for each file, not across both files.

The consolidated candidate was checked against the original `face19`: all 25 visible evaluated objects had identical positions/topology/radii, and the reference-angle render was pixel-identical. The saved candidate drops hidden discarded hair and uses Blender compression. This says nothing about likeness or production readiness; both remain unaccepted.

Old Astra stage scripts are preserved in `astra-male-proof/historical-scripts.zip` solely as historical source evidence. Historical incremental legacy refiners still exist, but their deleted intermediate binary inputs are intentionally not retained. Further legacy edits can start from the frozen V18 source; existing profile exports and public assets remain unchanged.
