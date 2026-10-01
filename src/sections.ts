/**
 * The eight Mithril Desktop sections that app.mithril.fund mirrors.
 * One list for Desktop and the web, so navigation cannot drift.
 *
 * `syncState` is `not-synced` for every section until a sync contract is implemented for it and
 * measured; a section never claims to be synced because it is listed here.
 */
export const APP_SECTION_IDS = ['discover', 'office', 'kanban', 'projects', 'capability', 'memory', 'settings', 'profile'] as const;
export type AppSectionId = (typeof APP_SECTION_IDS)[number];

export type AppSectionSyncState = 'not-synced';

export type AppSection = {
  id: AppSectionId;
  path: `/${AppSectionId}`;
  /** Where the same section lives in Mithril Desktop (view name from its sidebar). */
  desktop: { surface: 'view' | 'sidebar-group' | 'modal' | 'page'; name: string };
  label: { en: string; ja: string };
  syncState: AppSectionSyncState;
};

export const APP_SECTIONS: readonly AppSection[] = [
  { id: 'discover', path: '/discover', desktop: { surface: 'view', name: 'discover' }, label: { en: 'Discover', ja: '見つける' }, syncState: 'not-synced' },
  { id: 'office', path: '/office', desktop: { surface: 'view', name: 'office' }, label: { en: 'Office', ja: 'オフィス' }, syncState: 'not-synced' },
  { id: 'kanban', path: '/kanban', desktop: { surface: 'view', name: 'kanban' }, label: { en: 'Kanban', ja: 'カンバン' }, syncState: 'not-synced' },
  { id: 'projects', path: '/projects', desktop: { surface: 'sidebar-group', name: 'projects' }, label: { en: 'Projects', ja: 'プロジェクト' }, syncState: 'not-synced' },
  { id: 'capability', path: '/capability', desktop: { surface: 'view', name: 'tools' }, label: { en: 'Capabilities', ja: '機能' }, syncState: 'not-synced' },
  { id: 'memory', path: '/memory', desktop: { surface: 'view', name: 'memory' }, label: { en: 'Memory', ja: 'メモリー' }, syncState: 'not-synced' },
  { id: 'settings', path: '/settings', desktop: { surface: 'modal', name: 'settings' }, label: { en: 'Settings', ja: '設定' }, syncState: 'not-synced' },
  { id: 'profile', path: '/profile', desktop: { surface: 'page', name: 'agents' }, label: { en: 'Profile', ja: 'プロフィール' }, syncState: 'not-synced' },
];

export function isAppSectionId(value: string): value is AppSectionId {
  return (APP_SECTION_IDS as readonly string[]).includes(value);
}

export function appSectionByPath(pathname: string): AppSection | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return APP_SECTIONS.find((section) => section.path === clean);
}
