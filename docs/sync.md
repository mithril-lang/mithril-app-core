# Sync contract

The contract between Mithril Desktop and the Mithril cloud. **This package defines types and schemas only. Nothing here is a live service**; the server API, storage and Desktop client are separate work.

## Principles

- Opt-in and local-first. Desktop's local data stays authoritative until a person turns sync on.
- Never synced (no record kind exists for them): API tokens, wallet recovery phrases, provider keys, SSH or connection credentials, local filesystem paths, running-task execution state, chat transcripts.
- Memory is personal data. It is not evidence storage and not a place for legal advice.

## Records

One row per record: `kind`, `recordId`, optional `profileId`, `version` (per record), `seq` (per account), `updatedAt` (server seconds, informational), `deviceId`, `deleted` (tombstone), `body` (JSON, ≤ 16 KiB in UTF-8; a provisional limit, not measured), optional `blob` (`key`, `sha256`, `size`) for larger content.

The server assigns `version` and `seq`. A client's clock never decides a winner.

## Push, pull, conflicts

- `push`: each change carries `baseVersion` (0 = new). A stale base returns `conflict` with the server's current record. Nothing is overwritten silently.
- `pull`: `since=<seq>` returns records with a greater `seq`, `nextSeq`, `hasMore`.
- Conflict rule (`resolveConflict`): free-text kinds (`memory_entry`, `memory_user`, `soul`, `kanban_task`) keep both sides, with the local text saved as a new `…conflict-<version>` record for the person to merge. Other kinds adopt the server record. Deleting versus editing adopts the server record.
- CRDTs are not used. Revisit only if ordered lists (e.g. Kanban lane order) prove to need it.

## Kinds

| Kind | Notes |
| --- | --- |
| `memory_entry`, `memory_user`, `soul` | One entry per `MEMORY.md` item (Desktop splits on `§`), `USER.md`, `SOUL.md`. Scoped by `profileId`. |
| `setting` | Only values a person chose explicitly (e.g. locale), never an auto-detected value. |
| `profile_meta` | Display name and colour. Avatar would go through `blob`. |
| `project`, `project_session` | A named group and which conversation belongs to it. **No folder path**; Desktop keeps the path↔project mapping locally. |
| `kanban_board`, `kanban_task` | Board and card. Task status excludes `running`, which is local execution state. |
| `office_pref` | Office view preferences only. Avatars, positions and presence are not synced. |

## Open decisions (not settled by this package)

Tombstone retention, body and blob limits, whether a sync audit log exists, client-side encryption, how Desktop's Hermes `kanban.db` maps to `kanban_task` (the Hermes schema has not been verified).
