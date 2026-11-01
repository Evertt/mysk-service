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
- **Deleting Dutch** is deleting the `.nl.md` files and the `nl/wiki.json` messages.

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
- The link guard (`links.spec.ts`) and the line-drift check already read every `.md`, twins too.
- `messages.spec.ts` keeps `wiki.json` complete in both languages.

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
