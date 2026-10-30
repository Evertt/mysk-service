---
title: Tests and guard specs
summary: Four kinds of test, plus guard specs that refuse the hand-written way of doing something the kit already does.
section: internals
order: 6
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

Fieldworks is built so that the wrong way to do something fails a test, with a message that names the
right way. That is how a codebase that many people, and many agents, work on at once stays one
codebase.

What this means outside the code:

- **Another company's data stays another company's.** Every section is tested to keep North's
  records from South, also when someone tampers with an id. A new section without that test is
  incomplete.
- **A role's powers are tested, not assumed.** What an engineer may do and what a customer's contact
  sees are specs, so a refactor can't widen them quietly.
- **The real app is driven in a real browser.** A clean run drives the office, the engineer
  portal and the customer portal on a production build.
- **This wiki is tested too.** Every module, domain, shell and theme must be covered by a page, and
  every link to a file or another page must exist. A module added without a page fails the build.

<HowItWorks />

## The kinds of test

All tests are in `tests/` folders, never next to their subject, and mirror the code's shape: the
core's in `src/tests/unit/` and `src/tests/e2e/`, a module's in its own `tests/unit/` and
`tests/e2e/`. Tests import what they test through aliases (`#lib/orders/display.ts`).

| Kind            | Files                                  | What it checks                                                         |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| **Unit**        | `*.spec.ts`                            | Pure helpers: validation, formatting, domain rules, form schemas       |
| **Server spec** | `*.spec.ts` in `tests/unit/**/server/` | A section's server code, run as a tenant on a seeded database          |
| **Component**   | `*.svelte.spec.ts`                     | A shared component, rendered in a browser with `vitest-browser-svelte` |
| **End to end**  | `*.test.ts` in `tests/e2e/`            | The page: one signed-in page per file, changes through the UI          |

The rule of thumb is that what the server decides (its rules, its queries, what it logs, what it
refuses) is tested in a server spec, in a fraction of an e2e test's time, and the e2e test then only
checks that the page shows and sends it.

**Server specs** use a harness that runs the app's server code as a request runs it, without HTTP.
`as(actor, work)` runs `work` as North's owner, South's engineer or a customer's contact;
`call(getOrder, number)` and `submit(updateOrder, fields)` run SvelteKit's own validation, the set's
gate and the handler, and answer what the client would get. So an isolation test is a few lines: call
a remote function as South with North's id, and expect a 404. See
`src/tests/unit/lib/orders/server/tenancy.spec.ts`.

**End to end** tests drive a production build in Chromium, with one server and one fresh, seeded
database per worker. Sign-in is a session written into the database and a signed cookie, so a test
starts as the user it needs. The full run goes through a shared lock, because parallel builds slow
each other into timeouts.

## Guard specs

A guard spec reads the source as text and refuses the hand-written form of something the kit has one
way for. The failure names the file and line. The pattern is small: find the files, strip the
comments, match a regular expression, and list the offenders. Some of them:

| Guard                      | Refuses                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `lists.spec.ts`            | A table or toolbar built by hand instead of from a list's definition             |
| `hand-written.spec.ts`     | A tenant scope spelled out, a transaction in a `*.remote.ts`, a hand-made lookup |
| `remote-functions.spec.ts` | `query`, `form` and `command` imported from anywhere but the gated sets          |
| `access.spec.ts`           | A logged type with no access rule, a feed that skips the registry                |
| `state-colours.spec.ts`    | A raw palette colour that would look the same in every theme                     |
| `dialogs.spec.ts`          | `Dialog.Root` outside the components that own dialogs                            |
| `command-toasts.spec.ts`   | A hand-made try/catch toast around a command                                     |

A guard with exceptions has an allow-list that says _why_ each one stays.

The wiki has two guards of its own: `coverage.spec.ts` (every module id, core domain, shell and
theme appears in some page's `covers`, so a new one fails until a page covers it) and `links.spec.ts` (every `SourceLink` path, docs pointer and
`/wiki/…` link names something that exists). See <SourceLink path="src/tests/unit/wiki/coverage.spec.ts">coverage.spec.ts</SourceLink> and <SourceLink path="src/tests/unit/wiki/links.spec.ts">links.spec.ts</SourceLink>.

## Running them

`pnpm test` runs everything and reruns each file that fails once, afresh; a file that fails twice is
a real failure. `pnpm test:unit` runs every spec without e2e, which is the command after merging a
branch, since a guard spec fails on code another branch brought in. Before committing, run
`pnpm run check`, `pnpm knip` and the tests of what you changed.

<DocsPointer doc="docs/agents/tests.md" />
