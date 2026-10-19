# Multi-word search in the browser's tables

Wish 3 of 19 October 2026, after grilling (Q1).

## Problem

Typing "Bakker Tiel" into a table's search box should find the customer named Bakker in the city
Tiel. The server's lists already do this:

- `searchMatch()` (`src/lib/server/lists/plan.ts:263`) splits the text on whitespace, keeping at
  most 10 words.
- Each word must appear somewhere in the row's searched columns, case-insensitively for ASCII.
- That covers orders, equipment, and the module lists: materials, maintenance due, condition,
  checklists assets and partners.

The tables whose rows are all in the browser don't:

- Customers, engineers, contracts, invoices and credit notes use TanStack's `includesString`
  (`globalFilterFn` in `src/lib/components/data-table/table.svelte.ts:47`).
- `includesString` looks for the whole text in one column. "Bakker Tiel" finds nothing unless one
  column contains exactly that phrase.

## Decision (grilling)

Q1: a row matches when **every word appears in at least one searched column**. The words may be
in different columns. It's the server's rule, now in the browser too. No library is needed.

## Design

- **One function splits the text:** `searchWords(text): string[]`. It trims, splits on whitespace,
  drops empty words, and keeps at most 10. It goes in a file the server and the browser can both
  import, in the data table's folder, and `searchMatch()` uses it too. The 10-word limit then lives
  in one place, `listLimits` if that's where it belongs.
- **TanStack's global filter runs per column and keeps a row if any column passes.** That can't
  express "each word in some column". Pick one of these:
  - a hidden search column whose value joins the searchable columns' text (customers already have
    one, `src/lib/customers/list/columns.ts:102`), as the only column the global filter reads, with
    a filter function that requires every word; or
  - a row-level filter that runs before TanStack's.

  Write down why in the code. Whichever it is, it's in one place, used by every browser-side table.

- **Words match what the cells show.** Enum columns match their label in the current language
  (`label(kind, value)`), not the raw value. Dates match as they're displayed. Check each of the five
  tables for what it searches today, and keep the columns that are searchable as they are.
- **Case:** case-insensitive with `toLocaleLowerCase()`. No diacritics folding, the same as the
  server. If that turns out to matter for Dutch names, it's a follow-up for both sides.

## Tests

- **Unit:** `searchWords()`, and the filter function (every word required, words in different
  columns, case, more than 10 words).
- **e2e** for the customers table: a name word plus a city word finds the customer, and a word that
  matches nothing empties the list. Engineers get one case too. Take the values from the seed.
- The server lists' existing search specs still pass, now through `searchWords()`.

## Out of scope

Relevance ranking, quoted phrases, diacritics folding, and other client-side searches (the
command-palette pickers in forms). If any of those still match only the whole phrase, list them at
the end of this plan as a follow-up.

## As built

- **`searchWords()`** is in `src/lib/components/data-table/search-words.ts`, and the limit is
  `listLimits.words` (10). `searchMatch()` uses it; its specs (`plan.spec.ts`, condition's
  `connect.spec.ts`) pass unchanged.
- **The filter** is neither of the design's two options. It's the `allWords` filter function in
  `search-filter.ts`, registered in `features.ts`, and the hook's `globalFilterFn` in
  `table.svelte.ts`, so every client-side table has it. TanStack still calls it once per searched
  column. It answers for the whole row (all its searched columns' text, a column a line) at the
  row's first searched column, and returns `false` at the others. TanStack calls that first column
  for every row and stops at the first `true`. The row's result is then TanStack's own
  `columnFilters.__global__`, which the filters' counts read (`createFacetedRowModel`). The hidden
  column option would need a column in every table. The row-level option would leave the counts
  ignoring the search. The code comment says this too.
- **Which columns are searched** is still TanStack's: each column decides with
  `enableGlobalFilter`. One thing the plan didn't say: TanStack's default `getColumnCanGlobalFilter`
  only takes text and number columns (judged by their first value). A day column needs
  `enableGlobalFilter: true`. The list of searched columns is cached per table, columns and core
  rows, because TanStack has to scan the rows to decide.
- **What a cell shows:** an enum is read through the column's existing `meta.clickFilter`, which
  already names a value as shown (its doc now says so). This avoids adding a new meta. Days and
  moments are read through `formatDate`, and anything else as text. Lower case comes from
  `toLocaleLowerCase()`, with no diacritics folding.
- **The five tables** search the same columns as before:
  - Customers: name, contact, the hidden `search` column (code, email, city, phone, country as
    shown).
  - Engineers: name, email, region, now by its label.
  - Contracts: number, customer, level and status, now by their labels.
  - Invoices: number, customer and status (label).
  - Credit notes: number, customer, invoice, reason and status (label).

  One exception: the customers' `country` column is no longer searched. It searched the country
  as stored (in English), and the `search` column already has it as shown.

- **Tests:** `search-words.spec.ts` and `search-filter.spec.ts` cover every word required, words in
  different columns, case beyond ASCII, no match across two columns, enum labels, formatted days,
  columns left out, more than 10 words, a search of only white space, and the facets' counts. The
  e2e tests are in `customers.test.ts` (a name word plus a city word, then a word that matches
  nothing) and `engineers.test.ts` (a name word plus a region). Each reads its expected rows from
  the seeded database.

### Follow-ups

- The parts shop's product search in the customer portal
  (`src/modules/parts-shop/routes/(customer)/portal/+page.svelte`) still looks for the whole phrase
  in a product's name or SKU.
- Command pickers that use bits-ui's own filter (the order form's units, `units-field.svelte`; the
  Filter menu's list, `filter-menu.svelte`) score the phrase as a fuzzy match, so the words have to
  be in order. Pickers that search on the server (`record-filter.svelte`, condition's article
  field) go through `searchMatch()` and are fine. `record-filter.svelte` checks its `none` option
  against the whole phrase.
- A credit note without an invoice shows "Standalone", but searching that word doesn't find it,
  because the column's value is empty. Numbers would be searched unformatted (`1234`, not `1.234`).
  No table searches a number column today.
- Diacritics folding, for both sides, as the plan says.
