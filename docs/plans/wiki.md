# Wiki

A wish of 30 October 2026, worked out in a brainstorm. Built (October 2026): 37 pages in six
sections at `/wiki`, with search over titles and headings; the tasks were in
[wiki-implementation.md](wiki-implementation.md).

## Problem

Fieldworks has grown to four core domains, eleven optional modules, four shells, six themes and a
stack of mechanisms (tenancy, gated remote functions, the activity log and its feeds, the access
registry, extension points, server-side lists). What it does and how it works is spread over
`docs/agents/`, `docs/plans/`, the code and memory. Nobody can be shown the whole of it: not a
prospect, and not a developer or agent new to the code.

The wish: a wiki that lists and explains every feature, with diagrams and interactive widgets
wherever a concept is clearer seen or tried than read.

## Decisions

- **For both users and developers, layered.** Each page opens with what the feature does for its
  users, then a "How it works" half for developers.
- **Public, in the repo.** A route group `(wiki)` at `/wiki`, no sign-in, deployed with the app and
  committed with the code it describes. Not an artifact outside the repo: that can't import the
  code's data and goes stale silently.
- **Server-rendered, tenantless.** Every page is rendered per request from files in the repo; no
  wiki code reads the database or a tenant, or calls a remote function of its own. (Not
  prerendered: a prerendered page can't show the visitor's theme without a flash, see "Decisions
  after the spike".)
- **English only.** Pages are prose, not Paraglide messages; the wiki is exempt from the Paraglide
  rule, with the reason in the guard's allow-list. Dutch was out of scope then; it came later, a
  Dutch twin per page and the short strings as messages: see [wiki-dutch.md](wiki-dutch.md).
- **Widgets import the real data, never a copy.** The lifecycle diagram reads `orderTransitions`,
  the module map the manifests, the theme gallery `src/lib/themes`. When the code changes, the
  wiki changes with it. Real components are embedded only where they're pure (badges, the table
  on fixture rows, theme tokens), never the composite ones that need remote functions.
- **Module privacy.** A public wiki names every module, which makes
  [hide-unavailable-modules.md](hide-unavailable-modules.md) moot; that plan already calls module
  existence "not a secret that matters". Mark it superseded when the wiki ships. The repo is
  public, so the "How it works" halves reveal nothing new.

## Content

One page per feature, about 35 to start. Each page's front-matter gives its `title`, `section`,
`order`, `status` (`built`, `partly built`, `planned`) and `covers` (what the coverage guard
counts, e.g. `["module:maintenance", "domain:orders"]`). Plans in `docs/plans/` that aren't built
may get a page marked `planned`; it says so at the top.

| Section                         | Pages                                                                                                                           | Main widget                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Start                           | What Fieldworks is; roles and shells (office, engineer portal, customer portal, ops); try the demo                              | `RoleSwitcher`: pick a demo user, see the shell they land in and what they may do                                    |
| Orders                          | Lifecycle; order types; awaiting acceptance; work record; service report                                                        | `OrderLifecycle`: `orderTransitions` as a graph; click a status for its transitions and who may make them            |
| Customers, Equipment, Engineers | One page per domain; QR codes on units (`/q/[token]`)                                                                           | A diagram of the records: customer → sites → units → orders                                                          |
| Modules                         | An overview, and a page per module (all eleven)                                                                                 | `ModuleMap`: the manifests and `graph.ts`; switch modules on and off, see dependencies and what a tenant loses       |
| Across the app                  | Lists; activity log; live updates; notifications; dashboard; themes; bug reporter; offline and the service worker               | `ListPlayground` (the real table on fixture rows), `LiveFlow` (change → log → feed → page), `ThemeGallery`           |
| Under the hood                  | Tenancy; remote-function gates; the access registry; extension points; Cloudflare and the Durable Object; tests and guard specs | `TenancySimulator` (North and South rows, a query with and without `inTenant()`, a tampered id refused), `GateTable` |

A page's two halves:

1. **What it does**: plain language, a widget or screenshot, and a `<TryIt as="planner">` link to
   the demo login of the right role (the demo accounts of README.md, "Demo login").
2. **How it works**: the mechanism, a diagram, `<SourceLink>`s to the key files, and a pointer to
   the section of `docs/agents/` that has the rules.

## How it's built

### Routes and access

- `src/routes/(wiki)/wiki/+layout.svelte`: the wiki's own shell (a sidebar of sections and pages,
  search, the theme and mode switchers), in the Lagoon look. `+layout.ts` sets `prerender = false`: the pages are
  server-rendered.
- `src/routes/(wiki)/wiki/[...slug]/+page.ts` loads a page by its path (a 404 for an unknown
  one).
- `isPublic` in `src/hooks.server.ts` admits `/wiki` and everything under it.
- Links to `/wiki` from the login page and the office's user menu.

### Content and widgets

`src/wiki/`, a folder of its own outside `src/lib` and `src/routes`, as the modules have:

- `pages/<section>/<page>.md`: front-matter, then Markdown with Svelte components in it.
- `widgets/<name>/`: the interactive components, one folder each, with their fixtures.
- `parts/`: what pages share: `Diagram` (SVG in the theme's tokens, light and dark), `SourceLink`,
  `TryIt`, `DocsPointer`. Callouts use `src/lib/components/callout.svelte`.
- `nav.ts`: the sidebar's sections and pages, from the front-matter through `import.meta.glob`.

Markdown is turned into Svelte by **mdsvex**, if it works with Svelte 5's `experimental.async`,
SvelteKit 3 and Vite+ (step 1 finds out). If it doesn't, pages are `.svelte` files wrapped in a
`<Prose>` component: clumsier to write, with no dependency to keep working.

`SourceLink` points at `https://github.com/Evertt/mysk-service/blob/<commit>/<path>`, the commit
fixed at build time, so a page's links match the code it was built from.

### Widgets

| Widget             | Reads                                                                 | Shows                                                                                               |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `OrderLifecycle`   | `orderTransitions` (`src/lib/orders/lifecycle.ts`)                    | The statuses as a graph; a click highlights a status's transitions and the roles that may make them |
| `ModuleMap`        | the manifests (`src/lib/modules/manifests.ts`), `graph.ts`            | The modules and their dependencies; switching one off greys out what depends on it                  |
| `TenancySimulator` | fixtures of two tenants                                               | The rows a query returns with and without `inTenant()`; a tampered id refused                       |
| `GateTable`        | the gated sets of `src/lib/server/remote-functions.ts`, as documented | Which gate admits which role                                                                        |
| `LiveFlow`         | none                                                                  | An animated step-through: a change, its log entry, the shell's feed, the page that refreshes        |
| `ThemeGallery`     | `src/lib/themes`                                                      | Every theme's tokens and a sample card, light and dark                                              |
| `ListPlayground`   | fixture rows                                                          | The real table component: search, filters, grouping, columns                                        |
| `RoleSwitcher`     | `src/routes/demo-roles.ts`, the demo accounts                         | Each role's shell and what it may do                                                                |

A widget that needs server-only code imports only what's safe in the browser; where the data lives
in a server file, the widget gets a typed copy in its fixtures and a spec that compares it with the
original, so the copy can't drift.

### The kit and the guards

Widgets use the kit's components, formats and colours (`docs/agents/kit.md`). The wiki gets only
the exemptions it needs, each in its guard's allow-list with the reason: the Paraglide rule for
prose, and any page or layout rule a tenantless page can't meet.

## Staying current

- **Coverage guard** (`src/tests/unit/wiki/coverage.spec.ts`): every module id of the manifests,
  every core domain, every shell and every theme appears in some page's `covers`. A new module
  without a page fails the unit tests, naming what's missing. It starts with an allow-list of the
  pages not yet written, emptied by step 6.
- **Link guard**: every `SourceLink` path and docs pointer names a file that exists, so a rename
  fails a test instead of breaking the wiki.
- **Page links**: `links.spec.ts` ("every link between wiki pages has a page") is the only check
  on links between wiki pages: without a prerender the build doesn't crawl them.
- **AGENTS.md** gets a line under "Pointers": a feature added or changed gets its wiki page updated.
  `docs/agents/kit.md` gets a short "Wiki" entry: how to write a page and a widget.

## Tests

- Component specs for the widgets with state: `OrderLifecycle`, `ModuleMap`, `TenancySimulator`
  (a click shows the right edges or rows).
- One e2e file: `/wiki` opens signed out; the sidebar lists every section; a widget responds; a
  signed-in user can open it too.
- The coverage and link guards above.

## Order of work

Each step ends committed, with `pnpm run check`, `pnpm knip` and its specs green.

1. **Spike: mdsvex.** Does it compile Markdown with Svelte 5 components under `experimental.async`,
   SvelteKit 3 and Vite+, and can the pages be prerendered? Decide between mdsvex and `.svelte` pages; record the
   answer here.
2. **Skeleton.** The route group and its shell, `nav.ts`, `isPublic`, the links from
   the login page and the user menu, the coverage and link guards (with their allow-list), and one
   page ("What Fieldworks is") to prove the path.
3. **Shared parts.** `Diagram`, `SourceLink`, `TryIt`, `DocsPointer`, `RoleSwitcher`.
4. **Flagship widgets.** `OrderLifecycle`, `ModuleMap`, `TenancySimulator`, `LiveFlow`, with their
   specs.
5. **Pages.** Start, Orders, the domains, Modules, Across the app, Under the hood. Once step 4 is
   in, the sections can be written in parallel, one worktree agent each.
6. **Polish.** Search over titles and headings; phone width and dark mode; a Lagoon check; the
   coverage allow-list empty; [hide-unavailable-modules.md](hide-unavailable-modules.md) marked
   superseded; the e2e file.

## Out of scope

- Dutch pages (built later: [wiki-dutch.md](wiki-dutch.md)).
- Live tenant data in the wiki (it's tenantless).
- A full-text search index; search covers titles and headings.

## Decisions after the spike

Tried on 2026-10-30 with mdsvex 0.12.8, a throwaway route and `vp dev`, `vp build` and `vp preview`.

- **Pages are `.md` files (mdsvex).** `sveltekit({ extensions: [".svelte", ".md"], preprocess:
[mdsvex({ extensions: [".md"] })] })` compiles Markdown that imports a Svelte 5 component with
  `$state`/`$derived`, uses an `{#await}` block and an `{await …}` expression, under
  `experimental.async` and `runes: true`. It renders and hydrates in dev and in a production
  build, and `pnpm exec svelte-check` is clean. Three things to know:
  - mdsvex ships types only for `*.svx` and `*.svelte.md`, as `SvelteComponent` classes. Task 2
    adds a `declare module "*.md"` (a default `Component` and `metadata`) in `src/`, or
    svelte-check fails on every `.md` import.
  - Block syntax (`{#await}`, `{:then}`, `{/await}`) must stand on lines of its own, with a blank
    line before and after: next to text mdsvex wraps it in `<p>` and Svelte rejects the block.
  - `mdsvex` is registered in `vite.config.ts` and pinned in `package.json`.
- **`prerender = false`.** A prerendered page can't show the visitor's theme without a flash:
  - The build fails at the root layout, whose `await getTheme()` and `await getMode()` are remote
    queries (`remote_query_prerender`), and in `handleGuard`, which reads `event.url.search`
    (`url_search_unavailable_prerender`). Both can be worked around (`building`, reading `search`
    only when redirecting).
  - Then the prerendered `<html>` is static and the adapter serves it before the hooks run, so
    `handleTheme` never sees the cookies. With `Cookie: theme=harbor; mode=dark` the served
    `<html>` is `lang="nl" data-theme="lagoon" data-mode="system" class=""` (the build's
    defaults: also its language and time zone), the same as without cookies.
  - The client corrects it only after hydration, when the layout's queries answer: in the browser
    the theme and mode changed 45 ms after the first frame, with the splash screen showing the
    default colours until then. A flash, brief but there, for everyone not on the defaults.
  - Without the prerender the same route, served by the hooks, returns
    `data-theme="harbor" data-mode="dark" class="dark"` for those cookies.
  - So the wiki's pages are server-rendered (`prerender = false`), and the theme comes from the
    cookie as in the other shells. No wiki code reads the database or a tenant, but the hooks
    (`handleBetterAuth`) still resolve the session when a cookie comes along: a session lookup per
    wiki view for signed-in visitors.
