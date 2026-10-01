import { describe, expect, it } from 'vitest';
import { APP_SECTIONS, APP_SECTION_IDS, appSectionByPath, isAppSectionId } from '../src/sections';

describe('sections', () => {
  it('has exactly the eight sections once each, in order', () => {
    expect(APP_SECTIONS.map((s) => s.id)).toEqual([...APP_SECTION_IDS]);
    expect(APP_SECTION_IDS).toEqual(['discover', 'office', 'kanban', 'projects', 'capability', 'memory', 'settings', 'profile']);
    expect(new Set(APP_SECTIONS.map((s) => s.path)).size).toBe(8);
  });
  it('derives paths from ids and never claims a synced state', () => {
    for (const s of APP_SECTIONS) {
      expect(s.path).toBe(`/${s.id}`);
      expect(s.syncState).toBe('not-synced');
      expect(s.label.en && s.label.ja).toBeTruthy();
    }
  });
  it('resolves paths', () => {
    expect(appSectionByPath('/memory/')?.id).toBe('memory');
    expect(appSectionByPath('/extensions')).toBeUndefined();
    expect(isAppSectionId('kanban')).toBe(true);
    expect(isAppSectionId('download')).toBe(false);
  });
});
