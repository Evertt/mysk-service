# Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public wiki at `/wiki` that explains every feature of Fieldworks, with widgets that read
the code's own data.

**Architecture:** A route group `src/routes/(wiki)/wiki/` renders pages from `src/wiki/pages/`
(Markdown through mdsvex, or `.svelte`, per Task 1), listed by a registry that reads each page's
`metadata` through `import.meta.glob`. Widgets in `src/wiki/widgets/` keep their logic in plain
`.ts` files (unit-tested) that import the real data through the barrels; their `.svelte` files only
draw. Guard specs keep the wiki complete (coverage) and its source links valid.

**Tech Stack:** SvelteKit 3 (remote functions off for the wiki), Svelte 5 runes with
`experimental.async`, mdsvex 0.12 (if Task 1 passes), valibot, Tailwind 4, the kit's shadcn-svelte
components, Vitest 5 through `vp test`.

**Spec:** [docs/plans/wiki.md](wiki.md). Read it first; this plan argues from it.

## Global Constraints

- Every page is public: `/wiki` and everything under it is in `isPublic` (`src/hooks.server.ts`).
- No wiki file calls a remote function, reads the database or `currentTenant()`. The one
  exception: `<TryIt>` asks `demoSignInEnabled()` (`src/routes/demo.remote.ts`, `forAnyone`),
  in the browser only.
- English only. Chrome labels (section names, "Try it as …") are plain English strings in
  `src/wiki/`; no Paraglide messages are added for the wiki.
- Widgets import real data, never a copy. Outside a domain, import it through its barrel
  (`#lib/orders/index.ts`, not `#lib/orders/lifecycle.ts`): `domain-boundaries.spec.ts` refuses
  anything else.
- The wiki shell uses `<BrandMark>`, `<AppearanceSwitchers>` and `<NavSidebar>`
  (`shell-chrome.spec.ts`).
- Imports name the real extension; a new alias `#wiki/*` → `./src/wiki/*` in `package.json`'s
  `imports`.
- Lagoon (`DEFAULT_THEME`) is the look it's designed for; check phone width (375 px) and dark mode.
- Before each commit: `pnpm run check`, `pnpm knip`, and the specs the task names. No full suite
  from a subagent (see the global briefing rules); the coordinator runs `pnpm test:unit` after
  merging.
- Source links: `https://github.com/Evertt/mysk-service/blob/<commit>/<path>`.

## Review Focus

1. **A visitor with a theme or mode cookie** opening a server-rendered wiki page expects their own
   theme, not a Lagoon/light flash. The spike settled that the pages are server-rendered, so the
   hooks apply the cookie; Task 3's e2e test sets the cookie and checks `data-theme`.
2. **A signed-in member** opening `/wiki` expects the wiki, not a redirect to their shell's home
   (`shellOf()` sends members away from pages outside their shell). Task 3's e2e test opens
   `/wiki` signed in as the planner.
3. **A page slug that doesn't exist** (`/wiki/nope`) expects the app's 404 page, not a crash or
   an empty page. Task 3 tests the `load` with an unknown slug.
4. **A prospect clicking "Try it as the planner" on a server without demo sign-in** (production:
   `DEMO_SIGN_IN` is off) expects not to land on a password form they can't use. `<TryIt>`
   renders nothing unless `demoSignInEnabled()` answers true in the browser; Task 5 tests both
   answers.
5. **A phone visitor** expects the sidebar as a sheet and diagrams that fit 375 px without
   horizontal scroll. `<Diagram>` (Task 4) scales its SVG to the width; Task 10 checks every
   section at 375 px.

---

### Task 1: Spike: mdsvex and the prerender

Find out two things; keep no spike code. The outcome is a short "Decisions after the spike"
section added to `docs/plans/wiki.md`.

**Files:**

- Modify: `docs/plans/wiki.md` (append "Decisions after the spike")

- [ ] **Step 1: Vet mdsvex.** Use the `supermatt:dependency-vetting` skill on `mdsvex@0.12.8`
      (npm, author, repository, install scripts). Stop and report if it fails.
- [ ] **Step 2: Try mdsvex.** Add it, register `.md` in `sveltekit({ extensions, preprocess })` in
      `vite.config.ts`, and write a throwaway route rendering a `.md` file that imports a Svelte 5
      component with `$state` and an `{await}` block. Pass if `pnpm run check` is clean and the
      page renders under `vp dev` and `vp build` (with `runes: true` forced for project files, as
      `vite.config.ts` does).
- [ ] **Step 3: Try the prerender with a theme cookie.** Prerender the throwaway route
      (`export const prerender = true`) and add it to `isPublic`. In `vp build && vp preview`, open
      it with `theme=harbor; mode=dark` cookies. Pass if `<html>` ends up with
      `data-theme="harbor"` and `class="dark"` before first paint (no flash).
- [ ] **Step 4: Record the decisions** in `docs/plans/wiki.md`:
  - mdsvex passes → pages are `.md`; fails → pages are `.svelte` files wrapped in `<Prose>`,
    and the rest of this plan reads "page file" as `.svelte`.
  - the prerender passes → `prerender = true`; fails → `prerender = false` (pages are still
    server-rendered, and no wiki code reads the database or a tenant, so the theme comes from the
    cookie as in the other shells).
- [ ] **Step 5: Revert the spike code** (`git checkout -- vite.config.ts src/hooks.server.ts` and
      delete the throwaway route). If mdsvex passed, keep it in `package.json` and the
      `vite.config.ts` registration; it's needed from Task 2.
- [ ] **Step 6: Commit** `docs: the wiki spike's decisions` (with mdsvex and its registration if
      kept).

### Task 2: The page registry

**Files:**

- Modify: `package.json` (`imports`: `"#wiki/*": "./src/wiki/*"`)
- Modify: `src/lib/orders/lifecycle.ts:44` (export `type OrderActor`; Task 6 needs it)
- Create: `src/wiki/sections.ts`, `src/wiki/pages.ts`
- Create: `src/wiki/pages/start/what-fieldworks-is.md` (stub, one paragraph)
- Modify: `knip.ts` (entry `"src/wiki/pages/**/*.{md,svelte}"`, with a comment: loaded through
  `import.meta.glob`)
- Test: `src/tests/unit/wiki/pages.spec.ts`

**Interfaces:**

- Produces (`src/wiki/sections.ts`):

  ```ts
  export const wikiSections = [
  	"start",
  	"orders",
  	"domains",
  	"modules",
  	"across",
  	"internals",
  ] as const;
  export type WikiSection = (typeof wikiSections)[number];
  /** Title and icon per section, in sidebar order. */
  export const sectionInfo: Record<WikiSection, { title: string; icon: Component }>;
  ```

  Titles: Start, Orders, Customers, equipment and engineers, Modules, Across the app, Under the
  hood.

- Produces (`src/wiki/pages.ts`):

  ```ts
  export const coreDomains = ["orders", "customers", "equipment", "engineers"] as const;
  export type Coverage =
  	| `module:${ModuleId}`
  	| `domain:${(typeof coreDomains)[number]}`
  	| `shell:${ShellName}`
  	| `theme:${ThemeName}`;
  export interface PageMeta {
  	title: string;
  	summary: string;
  	section: WikiSection;
  	order: number;
  	status: "built" | "partly built" | "planned";
  	covers: Coverage[];
  }
  export interface WikiPage extends PageMeta {
  	/** Path under `/wiki`, e.g. `orders/lifecycle`. */
  	slug: string;
  	load: () => Promise<{ default: Component }>;
  }
  /** Validates each file's `metadata` (valibot); throws naming the file on the first bad one. Sorted by section order, then `order`, then title. */
  export function buildPages(
  	metadata: Record<string, unknown>,
  	loaders: Record<string, () => Promise<{ default: Component }>>,
  ): WikiPage[];
  export const wikiPages: WikiPage[]; // buildPages over the real globs
  export function pageBySlug(slug: string): WikiPage | undefined;
  export function wikiNav(pages?: readonly WikiPage[]): NavGroup[]; // a group per non-empty section; href `/wiki/<slug>`, icon the section's
  ```

  Globs: `import.meta.glob("./pages/**/*.{md,svelte}", { eager: true, import: "metadata" })` for
  the metadata, and the same without `eager` for the loaders. A `.svelte` page exports
  `metadata` from `<script module>`; mdsvex exports the front-matter as `metadata` itself. Keys
  `./pages/orders/lifecycle.md` → slug `orders/lifecycle`.

- [ ] **Step 1: Write the failing tests** in `pages.spec.ts`, against `buildPages()` with
      made-up inputs:
  - `"slugs drop ./pages/ and the extension"`: `./pages/orders/lifecycle.md` → `orders/lifecycle`.
  - `"sorts by section, then order, then title"`: three fixtures across `orders`/`start`, expect
    `start` first.
  - `"refuses an unknown section, naming the file"`: `section: "billing"` → throws a message
    containing `./pages/x/y.md`.
  - `"refuses a covers key that names no module"`: `covers: ["module:nope"]` → throws naming the
    file.
  - `"wikiNav makes a group per section with pages"`: two sections with pages, one without → two
    groups, titles from `sectionInfo`, hrefs `/wiki/<slug>`.
  - `"the real pages load"`: `wikiPages.length > 0`, and `pageBySlug("start/what-fieldworks-is")`
    is defined.
- [ ] **Step 2: Run** `pnpm exec vp test run src/tests/unit/wiki/pages.spec.ts`. Expected: FAIL
      (module not found).
- [ ] **Step 3: Implement** `sections.ts`, `pages.ts` and the stub page. Validate `covers` against
      `moduleIds`, `coreDomains`, the shell names (`office`, `engineer`, `customer`) and
      `themeNames`.
- [ ] **Step 4: Run the spec.** Expected: PASS. Then `pnpm run check` and `pnpm knip`: clean.
- [ ] **Step 5: Commit** `feat(wiki): the page registry`.

### Task 3: The route, the shell and public access

**Files:**

- Create: `src/routes/(wiki)/wiki/+layout.svelte`, `+layout.ts`, `+page.ts`,
  `[...slug]/+page.ts`, `[...slug]/+page.svelte`
- Create: `src/wiki/wiki-shell.svelte` (sidebar, header with `<BrandMark>` and
  `<AppearanceSwitchers>`, a column of prose)
- Modify: `src/hooks.server.ts:107` (`isPublic`: `pathname === "/wiki" ||
pathname.startsWith("/wiki/")`)
- Modify: `src/routes/login/+page.svelte` (a link "How Fieldworks works" to `/wiki`, under the
  form), `src/routes/(app)/user-menu.svelte` (a menu item "Wiki" to `/wiki`)
- Test: `src/tests/unit/routes/wiki/load.spec.ts`, `src/tests/e2e/wiki.test.ts`

**Interfaces:**

- Consumes: `wikiPages`, `pageBySlug`, `wikiNav` (Task 2).
- Produces: `[...slug]/+page.ts` exports `load({ params })` →
  `{ page: WikiPage, component: Component }`, or `error(404)` for an unknown slug. `/wiki`'s
  `+page.ts` redirects (307) to `/wiki/start/what-fieldworks-is`. `+layout.ts` sets `prerender = false`
  (the spike's decision), `ssr = true`, and `csr = true`.

- [ ] **Step 1: Write the failing load spec**: `"loads a known slug"` returns its `page.title`;
      `"404s an unknown slug"` throws with `status: 404` for `nope`.
- [ ] **Step 2: Write the failing e2e file** `wiki.test.ts` (copy `useApp` usage from
      `auth.demo.test.ts`):
  - `"opens signed out"`: `useApp({ user: null })`, go to `/wiki`; it lands on
    `/wiki/start/what-fieldworks-is` and the heading is "What Fieldworks is".
  - `"opens signed in, without being sent to the shell"`: as the planner, `/wiki` stays on
    `/wiki/…`.
  - `"keeps the visitor's theme"`: cookies `theme=harbor`, `mode=dark`; `<html>` has
    `data-theme="harbor"` and class `dark`.
  - `"404s an unknown page"`: `/wiki/nope` shows the app's 404.
  - `"lists every section with pages in the sidebar"`: the nav's group labels equal those of
    `wikiNav()`.
- [ ] **Step 3: Run** the load spec, and the e2e file through the lock:
      `lockf -k /tmp/mysk-service-tests.lock pnpm exec vp test run --project e2e src/tests/e2e/wiki.test.ts`.
      Expected: both FAIL.
- [ ] **Step 4: Implement** the routes, the shell and the links. If `shellOf()`'s redirect in
      `hooks.server.ts` catches `/wiki` for a signed-in user, skip it for public paths as it does
      for `/login`'s GET.
- [ ] **Step 5: Run** both again. Expected: PASS. Then `pnpm run check`, `pnpm knip`, and the
      guards the change touches: `pnpm exec vp test run src/tests/unit/shell-chrome.spec.ts
src/tests/unit/lib/domain-boundaries.spec.ts src/tests/unit/lib/auth/shells.spec.ts`. If a
      guard refuses a wiki file for a rule a public, tenantless page can't meet, add the file to
      that guard's allow-list with the comment `the wiki: public and tenantless (docs/plans/wiki.md)`.
- [ ] **Step 6: Commit** `feat(wiki): /wiki, its shell and the links to it`.

### Task 4: The coverage and link guards

**Files:**

- Create: `src/tests/unit/wiki/coverage.spec.ts`, `src/tests/unit/wiki/links.spec.ts`

**Interfaces:**

- Consumes: `wikiPages`, `coreDomains`, `Coverage` (Task 2); `moduleIds`, `themeNames`.
- Produces: `notYetWritten: readonly Coverage[]` at the top of `coverage.spec.ts`, the allow-list
  Tasks 7–9 empty.

- [ ] **Step 1: Write `coverage.spec.ts`**:
  - `"every module, domain, shell and theme has a page"`: expected keys (every `module:<id>`,
    `domain:<d>`, `shell:office|engineer|customer`, `theme:<name>`) minus the union of every
    page's `covers`, minus `notYetWritten`, equals `[]`. The failure lists the keys.
  - `"the allow-list holds only what's still missing"`: no key in `notYetWritten` is covered by a
    page (so it shrinks as pages land).
    Start `notYetWritten` as every key except those the stub page covers.
- [ ] **Step 2: Write `links.spec.ts`**. It reads every file in `src/wiki/**/*.{md,svelte}` as
      text:
  - `"every SourceLink names a file that exists"`: each `<SourceLink path="…"` value exists
    relative to the repo root. The failure lists `file:line → path`.
  - `"every DocsPointer names a file that exists"`: the same for `<DocsPointer doc="…"` (a path
    under `docs/agents/`, an optional `#anchor` ignored).
  - `"every link between wiki pages has a page"`: each `/wiki/<slug>` in an `href` or a Markdown
    link has `pageBySlug(slug)`.
  - One self-test per check on a made-up string (as `domain-boundaries.spec.ts` does), so a check
    can't silently pass on nothing.
- [ ] **Step 3: Run** both specs. Expected: PASS (the stub has no links yet; the self-tests
      prove the checks find offenders).
- [ ] **Step 4: Commit** `test(wiki): coverage and link guards`.

### Task 5: The shared parts

**Files:**

- Create: `src/wiki/parts/diagram.svelte`, `source-link.svelte`, `docs-pointer.svelte`,
  `try-it.svelte`, `how-it-works.svelte`, `page-status.svelte`, `prose.svelte`
- Modify: `vite.config.ts` (`define: { __WIKI_COMMIT__: JSON.stringify(<git rev-parse HEAD,
or "develop" when git fails>) }`), `src/app.d.ts` (`declare const __WIKI_COMMIT__: string`)
- Test: `src/tests/unit/wiki/parts.svelte.spec.ts`

**Interfaces:**

- `<Diagram viewBox="0 0 W H" label="…">{svg children}</Diagram>`: an `<svg>` at 100% width,
  `role="img"`, `aria-label`, colours only through the theme's CSS variables
  (`var(--primary)`, `var(--muted-foreground)`, …) so light, dark and every theme work.
- `<SourceLink path="src/lib/orders/lifecycle.ts" line={69}>label</SourceLink>`: an `<a>` to
  `https://github.com/Evertt/mysk-service/blob/${__WIKI_COMMIT__}/${path}#L${line}`, opens in a
  new tab; the label defaults to the path's file name.
- `<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy">`: a callout
  (`#lib/components/callout.svelte`) linking to the doc on GitHub: "The rules: …".
- `<TryIt as={DemoRole}>`: a button-link to `/login` reading "Try it as the {role label}", with
  the role's label from `demoRoleLabels` (`src/routes/demo-roles.ts`). The login page's demo
  buttons do the sign-in. It renders nothing on the server, and in the browser
  only once `demoSignInEnabled()` answers true.
- `<HowItWorks>`: the heading "How it works" and a divider before the developer half.
- `<PageStatus status>`: nothing for `built`; a callout for `partly built` and `planned`.

- [ ] **Step 1: Write the failing component tests**: SourceLink's `href` with and without `line`;
      TryIt's text for `planner` and its `href` is `/login`; PageStatus renders nothing for
      `built` and a callout containing "planned" for `planned`; Diagram has `role="img"` and its
      `aria-label`.
- [ ] **Step 2: Run** `pnpm exec vp test run src/tests/unit/wiki/parts.svelte.spec.ts`. Expected:
      FAIL.
- [ ] **Step 3: Implement** the parts, then run the `svelte-autofixer` on each until it reports
      nothing. Have `[...slug]/+page.svelte` render `<PageStatus>` above every page.
      For TryIt's test, mock `#routes/demo.remote.ts` with `vi.mock`: with `false` it renders no
      link; with `true` it renders the link above.
- [ ] **Step 4: Run** the spec: PASS; `pnpm run check`, `pnpm knip`: clean.
- [ ] **Step 5: Commit** `feat(wiki): diagrams, source links, demo links`.

### Task 6: The flagship widgets

One commit per widget. Each has a `.ts` with its logic (unit-tested) beside its `.svelte` (drawn
only). Run `svelte-autofixer` on every `.svelte` file.

**Files:**

- Create: `src/wiki/widgets/order-lifecycle/{lifecycle-graph.ts,order-lifecycle.svelte}`
- Create: `src/wiki/widgets/module-map/{module-map.ts,module-map.svelte}`
- Create: `src/wiki/widgets/tenancy-simulator/{tenancy.ts,tenancy-simulator.svelte}`
- Create: `src/wiki/widgets/live-flow/{live-flow.ts,live-flow.svelte}`
- Test: `src/tests/unit/wiki/widgets/{lifecycle-graph,module-map,tenancy,live-flow}.spec.ts`,
  `src/tests/unit/wiki/widgets/order-lifecycle.svelte.spec.ts`,
  `src/tests/unit/wiki/widgets/module-map.svelte.spec.ts`

**Interfaces:**

- `lifecycle-graph.ts` (imports `orderTransitions`, `type OrderActor`, `type OrderVerb` from
  `#lib/orders/index.ts`; `orderStatuses`, `type OrderStatus` from `#lib/models.ts`):

  ```ts
  export interface LifecycleEdge {
  	from: OrderStatus;
  	to: OrderStatus;
  	verb: OrderVerb;
  	by: OrderActor;
  }
  /** Every edge of `orderTransitions`, self-loops dropped; a function `to` (plan's) is applied to
   *  each `from` with `engineerId` null and 1, its distinct outcomes kept. */
  export function lifecycleEdges(transitions?: typeof orderTransitions): LifecycleEdge[];
  export function edgesOf(
  	status: OrderStatus,
  	edges?: LifecycleEdge[],
  ): { out: LifecycleEdge[]; in: LifecycleEdge[] };
  /** Columns left to right for drawing: awaiting_acceptance, quote, scheduled, in_progress, completed, invoiced; cancelled below. */
  export const statusLayout: Record<OrderStatus, { x: number; y: number }>;
  ```

- `module-map.ts` (imports `moduleIds`, `moduleGraph`, `type ModuleId` from
  `#lib/modules/ids.ts`; `effectiveModules` from `#lib/modules/graph.ts`):

  ```ts
  export type ModuleState = "on" | "off" | "dropped"; // dropped: switched on, but a requirement is off
  export function moduleStates(switchedOn: readonly ModuleId[]): Record<ModuleId, ModuleState>;
  export function moduleEdges(): { from: ModuleId; to: ModuleId; kind: "requires" | "enhances" }[];
  ```

  The component shows each module with its label and description from `modules`
  (`#lib/modules/manifests.ts`), a switch each, and the edges.

- `tenancy.ts`:

  ```ts
  export interface FixtureOrder {
  	id: number;
  	organization: "North" | "South";
  	number: string;
  	customer: string;
  }
  export const fixtureOrders: readonly FixtureOrder[]; // 3 North, 3 South
  export function runQuery(q: {
  	tenant: "North" | "South";
  	scoped: boolean;
  	id?: number;
  }): { rows: FixtureOrder[]; sql: string } | { refused: 404; sql: string };
  ```

  `sql` shows the statement as the app would write it, with `inTenant(order)` /
  `idInTenant(order, id)` when scoped.

- `live-flow.ts`:

  ```ts
  export const liveSteps: readonly {
  	id: "change" | "log" | "feed" | "refresh";
  	title: string;
  	detail: string;
  	source: string;
  }[];
  ```

  Steps name `recordActivity()` and the shell's feed (`docs/agents/kit.md`, "Staying live");
  `source` is a repo path for `<SourceLink>`. The component steps through them with
  Next/Back/Play.

- [ ] **Step 1: Write the failing logic specs** with these assertions:
  - lifecycle: an edge `{ from: "awaiting_acceptance", to: "quote", verb: "accept", by: "acceptance" }`;
    an edge `{ from: "quote", to: "scheduled", verb: "plan" }`; `edgesOf("invoiced").out` is only
    `uninvoice` → `completed`; no edge has `from === to`; every status in `orderStatuses` has a
    `statusLayout` entry.
  - module map: `moduleStates([...moduleIds])` is all `on`; `moduleStates(moduleIds without
"invoices")` has `partner-programme` and `parts-shop` `dropped`, and `invoices` `off`;
    `moduleEdges()` includes `{ from: "parts-shop", to: "materials", kind: "requires" }`.
  - tenancy: unscoped as North returns all 6 rows; scoped as North returns the 3 North rows and
    `sql` contains `inTenant`; scoped as North with a South id returns `{ refused: 404 }`; unscoped
    with that id returns the South row (the leak the scope prevents).
  - live flow: the step ids in order are `change, log, feed, refresh`, and every `source` exists
    on disk.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the four `.ts` files**; run the specs: PASS.
- [ ] **Step 4: Write the failing component specs**: clicking the `quote` status in
      `<OrderLifecycle>` marks the `plan` edge to `scheduled` (`data-active` on it) and lists the
      planner as who makes it; switching `invoices` off in `<ModuleMap>` marks `partner-programme`
      and `parts-shop` with `data-state="dropped"`.
- [ ] **Step 5: Implement the four components** with `<Diagram>`. Run the component specs: PASS.
      Then `pnpm run check`, `pnpm knip`.
- [ ] **Step 6: Commit** each widget as `feat(wiki): <widget>`.

### Task 7: Pages: Start, Orders, and the domains

Each page: front-matter per `PageMeta`, a "What it does" half, then `<HowItWorks>` with the
mechanism, `<SourceLink>`s and a `<DocsPointer>`. Write from the code and `docs/agents/`, not from
memory; the spec's "Content" table says what each section holds. Remove each `covers` key from
`notYetWritten` as its page lands.

**Files** (slug → covers):

- `start/what-fieldworks-is` (fill the stub) → —
- `start/roles-and-shells` → `shell:office`, `shell:engineer`, `shell:customer`; widget
  `RoleSwitcher` (below)
- `start/try-the-demo` → —; a `<TryIt>` per demo role
- `orders/lifecycle` → `domain:orders`; `<OrderLifecycle>`
- `orders/order-types`, `orders/awaiting-acceptance`, `orders/work-record`,
  `orders/service-report` → —
- `domains/customers` → `domain:customers`; `domains/equipment` → `domain:equipment` (QR codes,
  `/q/[token]`); `domains/engineers` → `domain:engineers`; a records diagram (customer → sites →
  units → orders) as a `<Diagram>` in `domains/customers`
- Create: `src/wiki/widgets/role-switcher/{roles.ts,role-switcher.svelte}`:
  `roles.ts` exports `roleCards: readonly { role: DemoRole; shell: ShellName; home: string;
can: string[] }[]`, with `shell` and `home` from `shells` (`#lib/auth/shells.ts`)
- Test: `src/tests/unit/wiki/widgets/roles.spec.ts`: each card's `home` equals
  `shells[card.shell].home`

- [ ] **Step 1:** Write `roles.spec.ts`, run (FAIL), implement `roles.ts` and the component, run
      (PASS).
- [ ] **Step 2:** Write the pages.
- [ ] **Step 3: Run** `pnpm exec vp test run src/tests/unit/wiki`. Expected: PASS, with the keys
      above gone from `notYetWritten`. Then `pnpm run check`.
- [ ] **Step 4:** Open each page in `vp dev` at 375 px and in dark mode; fix what overflows.
- [ ] **Step 5: Commit** `docs(wiki): start, orders and the domains`.

### Task 8: Pages: Modules

**Files:**

- `modules/overview` → —; `<ModuleMap>`
- One page per module, slug `modules/<id>`, covering `module:<id>`: checklists, condition,
  contracts, docks, energy, invoices, maintenance, materials, partner-programme, parts-shop,
  schedule. Each says what it adds (pages, slots, columns, bulk actions: read its `module.ts`),
  what it requires or enhances (from `moduleGraph`), and links its folder with `<SourceLink>`.
- `modules/extension-points` goes in Task 9 (Under the hood).

- [ ] **Step 1:** Write the pages.
- [ ] **Step 2: Run** `pnpm exec vp test run src/tests/unit/wiki`: PASS, with no `module:` keys
      left in `notYetWritten`. Then `pnpm run check`.
- [ ] **Step 3: Commit** `docs(wiki): the modules`.

### Task 9: Pages: Across the app, and Under the hood

**Files:**

- `across/lists` → —; `<ListPlayground>`: if `data-table.svelte` renders a local array of rows
  without a list definition's remote query, use it over 25 fixture rows; otherwise draw a
  miniature table with `#ui/table` over the same rows (search, a status filter, group by status)
  and note "simplified" on the page.
- `across/activity-log`, `across/live-updates` (`<LiveFlow>`), `across/notifications`,
  `across/dashboard`, `across/bug-reporter`, `across/offline` → —
- `across/themes` → every `theme:<name>`; `<ThemeGallery>`
  (`src/wiki/widgets/theme-gallery/theme-gallery.svelte`): a card per `themeNames` entry in a
  `data-theme` wrapper, light and dark side by side
- `internals/tenancy` → —; `<TenancySimulator>`
- `internals/gates` → —; `<GateTable>` (`src/wiki/widgets/gate-table/gates.ts` exports
  `gates: readonly { name: "forMembers" | "forManagers" | "forEngineers" | "forCustomers" |
"forAnyRole" | "forUsers" | "forAnyone"; admits: string }[]`, worded from AGENTS.md
  "Tenancy")
- `internals/permissions`, `internals/extension-points`, `internals/cloudflare`,
  `internals/tests-and-guards` → —
- Test: `src/tests/unit/wiki/widgets/gates.spec.ts`: every `gate.name` is exported by
  `src/lib/server/remote-functions.ts` (read the file as text and match `export const <name>`),
  so a renamed gate fails here

- [ ] **Step 1:** Write `gates.spec.ts`, run (FAIL), implement `gates.ts` and `<GateTable>`, run
      (PASS).
- [ ] **Step 2:** Write `<ThemeGallery>` and `<ListPlayground>`, then the pages.
- [ ] **Step 3: Run** `pnpm exec vp test run src/tests/unit/wiki`: PASS with `notYetWritten`
      empty; delete the constant and its spec. Then `pnpm run check`, `pnpm knip`.
- [ ] **Step 4: Commit** `docs(wiki): across the app, under the hood`.

### Task 10: Search, polish, and the docs

**Files:**

- Create: `src/wiki/search.ts`, `src/wiki/search.svelte` (in the shell's header)
- Modify: `AGENTS.md` (the real file; `CLAUDE.md` is a symlink to it): under "Pointers", the line
  `- **Wiki**: a feature added or changed gets its page in src/wiki/pages/ updated; a new module,
domain, shell or theme fails coverage.spec.ts until it has one (docs/plans/wiki.md).`
- Modify: `docs/agents/kit.md` (a "Wiki" entry: a page's front-matter, the parts, a widget's
  `.ts` and `.svelte`)
- Modify: `docs/plans/hide-unavailable-modules.md` (top: "Superseded by the public wiki
  (wiki.md), which names every module."), `docs/plans/wiki.md` (status line: built),
  `docs/plans/README.md` (the wiki row: built)
- Test: `src/tests/unit/wiki/search.spec.ts`; add to `src/tests/e2e/wiki.test.ts`

**Interfaces:**

- `search.ts`: `export function searchPages(query: string, index: readonly SearchEntry[]):
SearchEntry[]`, where `SearchEntry = { slug: string; title: string; heading?: string }`, built
  at build time from the pages' titles and their `##` headings (an
  `import.meta.glob(…, { query: "?raw", eager: true })` over the page files). Matches every word
  of the query, case-insensitive; titles rank above headings.

- [ ] **Step 1: Write the failing search spec**: `"lifecycle"` finds `orders/lifecycle` first;
      `"tenant scope"` matches only entries containing both words; `""` returns `[]`.
- [ ] **Step 2:** Run (FAIL), implement, run (PASS).
- [ ] **Step 3:** Add to `wiki.test.ts`: `"search finds a page"` (type "lifecycle", choose the
      result, land on `/wiki/orders/lifecycle`) and `"phone width shows the sidebar as a sheet"`
      (375 × 812: the menu button opens the nav). Run the file through the lock: PASS.
- [ ] **Step 4:** Check every section at 375 px and in dark mode, in Lagoon and one other theme;
      fix what overflows.
- [ ] **Step 5:** The docs edits above. `pnpm run check`, `pnpm knip`.
- [ ] **Step 6: Commit** `feat(wiki): search, and the wiki in the docs`.

## Parallel execution

Tasks 1–6 run in order; each depends on the one before. Tasks 7, 8 and 9 can run at the same
time in their own worktrees once Task 6 is merged: they touch separate page folders, and each
removes only its own keys from `notYetWritten`. Merge order 7 → 8 → 9; on a conflict in
`notYetWritten`, keep the keys neither side covers. Task 10 runs after all three.
