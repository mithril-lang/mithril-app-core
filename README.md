# @mithril/app-core

Small, dependency-light building blocks shared by **Mithril Desktop** and **app.mithril.fund**, so the two do not keep separate copies.

Status: `0.1.0`, **not published to npm yet**. This repository is public; it contains no secrets, no private code and no personal data, and must stay that way.

| Export | What it is |
| --- | --- |
| `@mithril/app-core/sections` | The eight sections (discover, office, kanban, projects, capability, memory, settings, profile): id, path, where each lives in Desktop, ja/en labels. Every section is `not-synced` until a sync contract exists for it. |
| `@mithril/app-core/locale` | `resolveLocale()`, a pure function: explicit choice → stored choice → `Accept-Language` → `navigator.languages` → `en`. Supports exactly the 12 locales Mithril Desktop ships (en, ja, zh-CN, zh-TW, es, pt-BR, pt-PT, id, tr, pl, ar, he); anything else is not guessed and falls back to English. `translate()` falls back to English per key. |
| `@mithril/app-core/sync` | The sync **contract**: record kinds, typed bodies (unknown fields rejected), push/pull schemas, conflict resolution rule. Types and schemas only, no transport or storage. See [docs/sync.md](docs/sync.md). |

```ts
import { resolveLocale, APP_SECTIONS } from '@mithril/app-core';

const { locale, manual } = resolveLocale({
  explicit: new URL(location.href).searchParams.get('lang'),
  stored: localStorage.getItem('locale'),
  navigatorLanguages: navigator.languages,
});
// Persist (and sync) `locale` only when `manual` is true, never an auto-detected value.
```

## Develop

```sh
npm install
npm run check   # typecheck, tests, build
```

Node 22+. The only runtime dependency is `zod`.

## What belongs here

Pure TypeScript with no DOM, Electron or Node dependency, and nothing that is secret or personal. Server code, storage, credentials and anything from the private `mithril-fund` repository do **not** belong here. Shared UI is planned as a later, separate entry point.

## License

MIT, matching the other public `mithril-lang` repositories (`mithril-desktop`, `mithril-registry`, `design-system`).
