/**
 * Sync contract between Mithril Desktop and the Mithril cloud: record types and request/response schemas.
 * This is a contract only. It contains no transport, no storage and no server logic; nothing here is live.
 *
 * Design (see docs/sync.md):
 *  - One row per record. The server assigns `version` (per record) and `seq` (per account); clients never
 *    invent either, and never trust their own clock for ordering.
 *  - A push carries `baseVersion`. A stale base is a conflict, answered with the server's current record, and is
 *    never silently overwritten. Text records keep both sides as a conflict copy for the person to choose.
 *  - Deletes are tombstones (`deleted: true`) so other devices learn of them.
 *  - Per-record `body` is small (limit below). Bigger content is referenced by `blob` (R2 key + sha256).
 *
 * Never synced, by construction (there is no kind for them): API tokens, wallet recovery phrases, provider
 * keys, SSH/connection credentials, local filesystem paths, running-task execution state, chat transcripts.
 */
import { z } from 'zod';

export const SYNC_KINDS = [
  'memory_entry', // one MEMORY.md entry (Desktop splits the file on its "§" delimiter)
  'memory_user', // USER.md
  'soul', // SOUL.md (persona)
  'setting', // an explicitly chosen preference, e.g. locale
  'profile_meta', // profile display name / colour (avatar goes through `blob`)
  'project', // a named group of conversations (no folder path)
  'project_session', // which conversation belongs to which project
  'kanban_board',
  'kanban_task',
  'office_pref', // Office view preferences, e.g. which profile is the "CEO"
] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/** Kinds whose body is free text a person wrote: a conflict keeps both versions instead of picking one. */
export const TEXT_KINDS: readonly SyncKind[] = ['memory_entry', 'memory_user', 'soul', 'kanban_task'];

export const SYNC_LIMITS = {
  /** Largest inline `body`, in UTF-8 bytes. A provisional value, not a measured one. */
  maxBodyBytes: 16 * 1024,
  maxRecordsPerPush: 100,
  maxRecordsPerPull: 500,
} as const;

/** Statuses a Kanban task may have in the cloud. `running` is deliberately absent: it is local execution state. */
export const SYNCED_KANBAN_STATUSES = ['triage', 'todo', 'scheduled', 'ready', 'blocked', 'review', 'done', 'archived'] as const;
export type SyncedKanbanStatus = (typeof SYNCED_KANBAN_STATUSES)[number];

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const profileId = id;

export const SyncBlobSchema = z.object({
  key: z.string().min(1).max(512),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
});
export type SyncBlob = z.infer<typeof SyncBlobSchema>;

/** Typed bodies, one per kind. Unknown fields are rejected so a client cannot smuggle a secret field through. */
export const SyncBodies = {
  memory_entry: z.object({ content: z.string().max(4096) }).strict(),
  memory_user: z.object({ content: z.string().max(4096) }).strict(),
  soul: z.object({ content: z.string().max(8192) }).strict(),
  setting: z.object({ value: z.union([z.string().max(256), z.boolean(), z.number()]) }).strict(),
  profile_meta: z.object({ name: z.string().max(100).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict(),
  project: z.object({ name: z.string().min(1).max(200), archived: z.boolean().optional() }).strict(),
  project_session: z.object({ projectId: id }).strict(),
  kanban_board: z.object({ name: z.string().min(1).max(200) }).strict(),
  kanban_task: z
    .object({
      boardId: id,
      title: z.string().min(1).max(500),
      body: z.string().max(8192).optional(),
      status: z.enum(SYNCED_KANBAN_STATUSES),
      priority: z.number().int().min(-100).max(100).optional(),
      assigneeProfileId: profileId.optional(),
    })
    .strict(),
  office_pref: z.object({ value: z.union([z.string().max(256), z.boolean(), z.number()]) }).strict(),
} as const satisfies Record<SyncKind, z.ZodType>;

/** A record as the server stores and returns it. */
export const SyncRecordSchema = z.object({
  kind: z.enum(SYNC_KINDS),
  recordId: id,
  /** Scopes per-profile records (memory, soul, profile_meta). Absent for account-wide records. */
  profileId: profileId.optional(),
  version: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  /** Server time, unix seconds. Informational: it is never used to decide a winner. */
  updatedAt: z.number().int().nonnegative(),
  deviceId: id,
  deleted: z.boolean(),
  body: z.record(z.string(), z.unknown()).nullable(),
  blob: SyncBlobSchema.optional(),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

/** UTF-8 length without depending on DOM or Node typings. Lone surrogates count as 3 bytes, like U+FFFD. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
}

/** Validate a record's `body` against its kind. Tombstones must have no body. */
export function validateRecordBody(record: Pick<SyncRecord, 'kind' | 'deleted' | 'body'>): { ok: true } | { ok: false; reason: string } {
  if (record.deleted) return record.body === null ? { ok: true } : { ok: false, reason: 'tombstone_with_body' };
  if (record.body === null) return { ok: false, reason: 'missing_body' };
  const parsed = SyncBodies[record.kind].safeParse(record.body);
  if (!parsed.success) return { ok: false, reason: 'invalid_body' };
  if (utf8Bytes(JSON.stringify(record.body)) > SYNC_LIMITS.maxBodyBytes) return { ok: false, reason: 'body_too_large' };
  return { ok: true };
}

/** One change a client wants to apply. `baseVersion` is the version the client last saw (0 = new record). */
export const SyncChangeSchema = z.object({
  kind: z.enum(SYNC_KINDS),
  recordId: id,
  profileId: profileId.optional(),
  baseVersion: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
  body: z.record(z.string(), z.unknown()).nullable(),
  blob: SyncBlobSchema.optional(),
});
export type SyncChange = z.infer<typeof SyncChangeSchema>;

export const SyncPushRequestSchema = z.object({
  deviceId: id,
  changes: z.array(SyncChangeSchema).min(1).max(SYNC_LIMITS.maxRecordsPerPush),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncPushResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('applied'), recordId: id, kind: z.enum(SYNC_KINDS), version: z.number().int(), seq: z.number().int() }),
  /** The base was stale. `current` is the server's record; the client must merge or ask the person. */
  z.object({ status: z.literal('conflict'), recordId: id, kind: z.enum(SYNC_KINDS), current: SyncRecordSchema }),
  z.object({ status: z.literal('rejected'), recordId: id, kind: z.enum(SYNC_KINDS), reason: z.string() }),
]);
export type SyncPushResult = z.infer<typeof SyncPushResultSchema>;

export const SyncPushResponseSchema = z.object({ results: z.array(SyncPushResultSchema) });
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

export const SyncPullQuerySchema = z.object({
  /** Highest `seq` the client has applied. 0 = from the beginning. */
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_LIMITS.maxRecordsPerPull).default(SYNC_LIMITS.maxRecordsPerPull),
});
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

export const SyncPullResponseSchema = z.object({
  records: z.array(SyncRecordSchema),
  /** Pass back as `since`. Equal to the request's `since` when there is nothing new. */
  nextSeq: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

/**
 * Decide what to do with a conflict. Text kinds keep both sides so nothing a person wrote is lost silently;
 * other kinds take the server's record (it is the later accepted write) and tell the caller it did.
 */
export function resolveConflict(
  kind: SyncKind,
  local: SyncChange,
  current: SyncRecord,
): { action: 'keep-both'; conflictCopy: SyncChange; adopt: SyncRecord } | { action: 'adopt-server'; adopt: SyncRecord } {
  if ((TEXT_KINDS as readonly SyncKind[]).includes(kind) && !local.deleted && !current.deleted && local.body) {
    // The copy is a new record id, so the person's text survives and can be merged by hand.
    return {
      action: 'keep-both',
      conflictCopy: { ...local, recordId: `${local.recordId}.conflict-${current.version}`, baseVersion: 0 },
      adopt: current,
    };
  }
  return { action: 'adopt-server', adopt: current };
}
