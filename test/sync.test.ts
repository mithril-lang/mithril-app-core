import { describe, expect, it } from 'vitest';
import {
  SYNC_KINDS, SYNC_LIMITS, SyncBodies, SyncPullQuerySchema, SyncPullResponseSchema, SyncPushRequestSchema, SyncPushResponseSchema,
  SyncRecordSchema, resolveConflict, utf8Bytes, validateRecordBody, type SyncChange, type SyncRecord,
} from '../src/sync';

const rec = (over: Partial<SyncRecord> = {}): SyncRecord => ({ kind: 'memory_entry', recordId: 'm1', version: 3, seq: 10, updatedAt: 1, deviceId: 'dev-a', deleted: false, body: { content: 'a' }, ...over });

describe('kinds and bodies', () => {
  it('has a body schema for every kind and none for secrets or local paths', () => {
    for (const k of SYNC_KINDS) expect(SyncBodies[k]).toBeDefined();
    for (const bad of ['token', 'wallet', 'provider_key', 'ssh', 'path', 'session', 'chat']) expect((SYNC_KINDS as readonly string[]).some((k) => k.includes(bad) && k !== 'project_session')).toBe(false);
  });
  it('rejects unknown fields so a secret cannot ride along', () => {
    expect(validateRecordBody({ kind: 'memory_entry', deleted: false, body: { content: 'x', apiKey: 'sk' } })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(validateRecordBody({ kind: 'project', deleted: false, body: { name: 'P', folderPath: '/home/me/x' } })).toEqual({ ok: false, reason: 'invalid_body' });
  });
  it('never syncs the running state of a Kanban task', () => {
    expect(SyncBodies.kanban_task.safeParse({ boardId: 'b', title: 't', status: 'running' }).success).toBe(false);
    expect(SyncBodies.kanban_task.safeParse({ boardId: 'b', title: 't', status: 'done' }).success).toBe(true);
  });
  it('requires tombstones to have no body and live records to have one', () => {
    expect(validateRecordBody({ kind: 'soul', deleted: true, body: null })).toEqual({ ok: true });
    expect(validateRecordBody({ kind: 'soul', deleted: true, body: { content: 'x' } })).toEqual({ ok: false, reason: 'tombstone_with_body' });
    expect(validateRecordBody({ kind: 'soul', deleted: false, body: null })).toEqual({ ok: false, reason: 'missing_body' });
  });
  it('enforces the inline body size limit in UTF-8 bytes, not characters', () => {
    // 8192 Japanese characters pass the character cap but are 24 KiB in UTF-8.
    const body = { boardId: 'b', title: 't', status: 'todo', body: '\u3042'.repeat(8192) };
    expect(SyncBodies.kanban_task.safeParse(body).success).toBe(true);
    expect(validateRecordBody({ kind: 'kanban_task', deleted: false, body })).toEqual({ ok: false, reason: 'body_too_large' });
  });
  it('counts UTF-8 bytes correctly', () => {
    expect(utf8Bytes('a')).toBe(1);
    expect(utf8Bytes('\u00e9')).toBe(2);
    expect(utf8Bytes('\u3042')).toBe(3);
    expect(utf8Bytes('\u{1F600}')).toBe(4);
    expect(utf8Bytes('\ud800')).toBe(3);
  });
});

describe('schemas', () => {
  it('accepts a well-formed record and rejects a negative version', () => {
    expect(SyncRecordSchema.safeParse(rec()).success).toBe(true);
    expect(SyncRecordSchema.safeParse(rec({ version: -1 })).success).toBe(false);
  });
  it('bounds a push', () => {
    const change = { kind: 'memory_entry', recordId: 'm1', baseVersion: 0, body: { content: 'a' } };
    expect(SyncPushRequestSchema.safeParse({ deviceId: 'd', changes: [change] }).success).toBe(true);
    expect(SyncPushRequestSchema.safeParse({ deviceId: 'd', changes: [] }).success).toBe(false);
    expect(SyncPushRequestSchema.safeParse({ deviceId: 'd', changes: Array(SYNC_LIMITS.maxRecordsPerPush + 1).fill(change) }).success).toBe(false);
    expect(SyncPushRequestSchema.safeParse({ deviceId: 'bad id!', changes: [change] }).success).toBe(false);
  });
  it('parses the three push outcomes', () => {
    const ok = SyncPushResponseSchema.safeParse({ results: [
      { status: 'applied', recordId: 'a', kind: 'soul', version: 1, seq: 2 },
      { status: 'conflict', recordId: 'b', kind: 'soul', current: rec({ kind: 'soul', body: { content: 'x' } }) },
      { status: 'rejected', recordId: 'c', kind: 'soul', reason: 'invalid_body' },
    ] });
    expect(ok.success).toBe(true);
  });
  it('defaults and bounds a pull', () => {
    expect(SyncPullQuerySchema.parse({})).toEqual({ since: 0, limit: SYNC_LIMITS.maxRecordsPerPull });
    expect(SyncPullQuerySchema.safeParse({ limit: '100000' }).success).toBe(false);
    expect(SyncPullResponseSchema.safeParse({ records: [rec()], nextSeq: 10, hasMore: false }).success).toBe(true);
  });
});

describe('resolveConflict', () => {
  const local: SyncChange = { kind: 'memory_entry', recordId: 'm1', baseVersion: 2, deleted: false, body: { content: 'mine' } };
  it('keeps both sides for free text instead of overwriting', () => {
    const r = resolveConflict('memory_entry', local, rec({ version: 3 }));
    expect(r.action).toBe('keep-both');
    if (r.action === 'keep-both') {
      expect(r.conflictCopy.recordId).toBe('m1.conflict-3');
      expect(r.conflictCopy.baseVersion).toBe(0);
      expect(r.conflictCopy.body).toEqual({ content: 'mine' });
      expect(r.adopt.body).toEqual({ content: 'a' });
    }
  });
  it('adopts the server record for non-text kinds and for deletes', () => {
    expect(resolveConflict('setting', { ...local, kind: 'setting', body: { value: 'ja' } }, rec({ kind: 'setting', body: { value: 'en' } })).action).toBe('adopt-server');
    expect(resolveConflict('memory_entry', { ...local, deleted: true, body: null }, rec()).action).toBe('adopt-server');
    expect(resolveConflict('memory_entry', local, rec({ deleted: true, body: null })).action).toBe('adopt-server');
  });
});
