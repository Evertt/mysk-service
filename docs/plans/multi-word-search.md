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
