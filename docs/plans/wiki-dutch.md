# The wiki in Dutch

A wish of 1 November 2026, after the wiki was built ([wiki.md](wiki.md)): the wiki in both of the
app's languages, instead of English only. Built: every page has its twin.

## Decisions

- **Prose: a Dutch twin per page.** Beside each page `src/wiki/pages/<section>/<page>.md` sits
  `<page>.nl.md`, picked when the locale is `nl`. Prose stays Markdown, readable and editable.
  Paraglide isn't used for paragraphs: ~26,000 words as messages would turn every page into a
  component calling hundreds of messages, with Markdown, code and links inside them.
- **A twin's front-matter holds only what's translated:** `title` and `summary` (and the `headings`
  the Markdown pass adds). `section`, `order`, `status` and `covers` are the English page's alone.
- **Short strings are Paraglide messages:** the sidebar's sections, search, the parts ("How it
  works", the status notices, "Try it as …"), and every text in the widgets. Existing messages are
  reused wherever they say the same (order statuses through `label()`, module names and
  descriptions from the manifests, the demo roles' labels, `common_*`); what's new goes in its own
  section, `messages/{en,nl}/wiki.json` (keys `wiki_*`), so the wiki's strings can be found, moved
  or deleted together.
- **The language is the app's:** the wiki follows the visitor's locale like the rest of the app
  (`lang` on the page follows it). The English-only measures go: the forced `lang="en"` and the
  wiki's own English role names.
- **English is the fallback** for a page without its twin (while one is being written): its
  content is marked `lang="en"`. A guard keeps that from shipping.
- **Deleting Dutch** is possible, and stays small: see "Deleting Dutch" below.

## Guards

- **Twins** (`src/tests/unit/wiki/twins.spec.ts`): every page has its `.nl.md`; every twin has
  its page; a twin's front-matter has exactly `title` and `summary`; and the two agree in
  structure, so a change to one that isn't made to the other fails:
  - the same components, in the same order, with the same literal `path`, `doc`, `line`,
    `symbol` and `as` (the `<script>` imports the same);
  - the same number of `##` headings;
  - the same `/wiki/…` link targets.
    It started with an allow-list of the pages whose twins weren't written yet; with every twin
    written, the list is gone. It also fails on a twin with no prose, and checks a `DocsPointer`'s
    `section`.
  - A twin is a translation: more than half of its prose lines (code, tags, link targets and
    addresses left out) can't also stand in the English page, so a page copied to `.nl.md` fails.
  - A twin keeps its page's code: the same inline code spans and the same code blocks, as
    multisets (a Dutch sentence may order them differently), as `messages.spec.ts` does for the
    messages. A module's or a flag's id the page doesn't set in code font is plain text in the
    twin.
- The link guard (`links.spec.ts`) and the line-drift check already read every `.md`, twins too.
- `messages.spec.ts` keeps `wiki.json` complete in both languages.

## Deleting Dutch

The twins and the short strings come out separately, and some of the Dutch stays because it is the
app's, not the wiki's.

1. **The twins.** Delete the `.nl.md` files, `src/tests/unit/wiki/twins.spec.ts` (it refuses a
   page without its twin) and the Dutch tests: `dutch.svelte.spec.ts`, the Dutch case in
   `parts.svelte.spec.ts`, the twin and `nl` cases in `pages.spec.ts` and `search.spec.ts`,
   `src/tests/unit/routes/(wiki)/wiki/page.svelte.spec.ts` and the Dutch tests in
   `src/tests/e2e/wiki.test.ts` (`inDutch`). The registry's twin side (`twinMeta`, `fileOf`,
   `text.nl`) then has nothing to read; remove it with its tests, or leave it unused.
2. **The not-translated note.** Without twins, a Dutch visitor reads every page in English, so the
   note (`untranslated` in the route's `+page.ts`, the callout in its `+page.svelte`, and
   `wiki_not_translated`) would sit on every page: remove it. Keep `lang="en"` on the article, as
   the pages are English and the app around them is Dutch.
3. **The short strings.** `messages/nl/wiki.json` can't just be deleted. Paraglide's file list in
   `project.inlang/settings.json` names a section once for all languages (`{locale}`), and
   `src/tests/unit/lib/i18n/messages.spec.ts` wants every registered file in every language, so
   a missing `nl/wiki.json` fails that spec and leaves the sidebar, search and widget texts without
   a Dutch version. To end Dutch there, replace the values in `nl/wiki.json` with the English
   ones (the specs pass as they are); to remove the wiki's messages altogether, unregister
   `wiki.json` from `settings.json`, delete both files, and take `src/tests/unit/wiki/messages.spec.ts`
   with them.

What remains in Dutch for a Dutch visitor: the words the wiki reuses from the app, not its own:
order statuses and other enum values (`label()`), the modules' names and descriptions, the demo
roles, `common_*`, and the app shell around the wiki. A wiki that is English only is therefore
English with those words in Dutch, unless the app's `nl` goes too.

Moving `wiki.json` (say to `src/wiki/messages/{locale}/wiki.json`) takes: its entry in
`project.inlang/settings.json`; the path regex in `src/tests/unit/lib/i18n/messages.spec.ts`,
which accepts only `messages/` at the root and `src/modules/<id>/messages/`, and the settings
check beside it; and the path in `src/tests/unit/wiki/messages.spec.ts`
(`../../../../messages/${locale}/wiki.json`).

## Dutch copy

`docs/agents/i18n.md`, "Dutch": informal (`je`), short, sentence case, and its term list. A term
the app already translates is translated the same way: find the English in `messages/en/*.json`
and use its `nl` counterpart. Developer terms (remote function, guard spec, barrel, slot) and
anything in code font stay as they are; the first time a page uses one, a few Dutch words say what
it is.

## Order of work

1. **The machinery** (one task, first): the registry, `virtual:wiki-pages`, the route, the search
   and `lang` per locale; `wiki.json` registered; the twins guard with its allow-list; one twin
   (`start/what-fieldworks-is.nl.md`) to prove it; the e2e: a Dutch visitor gets the Dutch page.
2. **In parallel, once 1 is in:**
   - the short strings: the shell, `sections.ts`, the parts, the search UI and every widget's
     text into Paraglide (existing messages first, then `wiki.json`), and the wiki's role names
     back to the demo roles' labels;
   - the twins, in three groups, each removing its pages from the allow-list:
     Start, Orders and the domains (11 pages); Modules (12); Across the app and Under the hood (14).
3. **Docs:** AGENTS.md's wiki line, the kit's "Wiki" entry and `i18n.md` (the `wiki` section, the
   twins), and [wiki.md](wiki.md)'s "English only" decision pointing here.
