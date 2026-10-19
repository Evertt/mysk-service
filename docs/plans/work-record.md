# An order's work record across the portals

Candidate C5 of `docs/reviews/architecture-review.md` (X5, D16, D17), after grilling (Q1–Q9 below)
and the design-it-twice step: the "audience table" design, with scopes that carry their audience
and the "building blocks" design's reads as its private inside.

## Problem

- **Four readers of one record.** "An order with what was done on site" (its units at their
  sites, the notes, the sign-off) is read by the office (`getOrder` and `getWorkReport`), the
  engineer portal (`getMyOrder`), the customer portal (`getPortalOrder` with `unitsOfOrders`) and
  the checklists module's printed work order (`loadWorkOrder`), each with its own select tree.
- **Copies:** the units → sites derivation is verbatim in `order.remote.ts` and `portal.remote.ts`
  and again in `work-order.ts` (with another fallback: the customer's first site); the notes
  select is byte-identical twice; the sign-off select is written four times, its markup three times
  with three layouts and image sizes; the notes markup twice.
- **The unit's one-line description** has five hand-written shapes with the fields in different
  orders, beside two helpers (`unitLine`, `unitDetails`) that most pages bypass.
- **What each portal may see** (no notes for customers, the engineer by first name, "collected by"
  only in the office) lives in which columns each reader happens to select.
- **Symptoms:** change amplification (a new sign-off column touches four reads and three
  components), unknown unknowns (a customer reader could start selecting notes and nothing would
  say it shouldn't).

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Only the work record: the reader and the shared rendering of sign-off and notes. The portals' shells and the unit and location pages' readers stay out.                                                                |
| Q2  | Where the portals show the same thing differently, align it, except where the difference is intentional (Q7).                                                                                                          |
| Q4  | One sign-off component and one notes list, where the markup is the same thing.                                                                                                                                         |
| Q5  | The printed work order (`loadWorkOrder`) uses the reader too, and an order without units shows a site only when the customer has exactly one (no more "first site").                                                   |
| Q6  | The unit line is aligned everywhere, not only on the order pages.                                                                                                                                                      |
| Q7  | Intentional, kept: no notes or prices for customers; the engineer by first name for customers; only the contact's sites' units; history, prices, tags and the decider office-only; "collected by" office-only.         |
| Q8  | The unit line is '<model> · <serial>' (the name's model when it has a name), then the page's extras in this order: category, site, location.                                                                           |
| Q9  | The sign-off's one layout is the customer portal's: "Signed off by <signer> on <date>", then the two signatures as labelled figures side by side (stacked on a phone), one image size; the office adds "collected by". |

## Proposed interface

### `src/lib/orders/server/work-record.ts` (through `#lib/orders/server/index.ts`)

```ts
/** What each audience sees of an order's work record: the only place it's declared. */
export const audiences = {
	office: { notes: true, collectedBy: true, engineer: "full", site: "onSite" },
	engineer: { notes: true, collectedBy: false, engineer: "omit", site: "onSite" },
	customer: { notes: false, collectedBy: false, engineer: "first", site: "address" },
	workOrder: { notes: false, collectedBy: false, engineer: "full", site: "address" },
} as const satisfies Record<string, Policy>;
export type Audience = keyof typeof audiences;

/** A scope finds the order and names its audience; only these make one. */
export function officeOrder(number: string): WorkScope<"office">; // inTenant
export function engineerWork(ref: OrderRef): Promise<WorkScope<"engineer">>; // engineerOrder()
export function customerWork(access: CustomerAccess, number: string): WorkScope<"customer">; // customerOrders + atSites
export function printedWorkOrder(where: SQL, unitsAt: SQL | undefined): WorkScope<"workOrder">;

/** The work record the scope's audience sees, or `undefined` (the caller 404s, with its message). */
export function readWorkRecord<A extends Audience>(
	scope: WorkScope<A>,
): Promise<WorkRecord<A> | undefined>;
```

- **`WorkRecord<A>`** has `order: { id, number, customerId }`, `units` (in their order, each with
  its category, location and site, the site's detail by the audience's `site`), `sites` (the units'
  distinct sites, or the customer's only one, else none), `signoff` (five columns, plus
  `collectedBy` only where the table says), and, only where the table says, `notes` and `engineer`
  (full or first name). A key the table says no to isn't in the type: a customer's record has no
  `notes`.
- **Invariants:** `inTenant` on every table read; the site limit applied in SQL to the units; the
  unitless site rule the same for every audience.
- **The private inside:** the units-at-sites read, the sites rule, the notes read and the
  sign-off read are functions of this file (not exported), tested on their own through the reader.
- **What stays out (each caller keeps it):** the order's header (its own columns, the customer's
  contact, the request and its decider), prices, totals, tags, history, checklists.

### `unitLine()` (`src/lib/equipment/display.ts`, replacing `unitLine` and `unitDetails`)

```ts
export const unitLine = (
	unit: { name: string | null; manufacturer: string; model: string; serialNumber: string },
	extras: { category?: string | null; site?: string | null; location?: string | null } = {},
) =>
	[
		unit.name ? unitModel(unit) : null,
		unit.serialNumber,
		extras.category,
		extras.site,
		extras.location,
	]
		.filter(Boolean)
		.join(" · ");
```

(the name-less case keeps today's rendering: check `unitModel` and the call sites while moving).

### Components (`#lib/orders/components.ts`)

- `<SignOff signoff />`: Q9's layout; shows "collected by" when the sign-off has it.
- `<NotesList notes empty? footer? />`: the list; the engineer's card passes its empty state and
  add-note form.

### Usage

```ts
// getMyOrder
const scope = await engineerWork({ number });
const [header, record] = await Promise.all([myOrderHeader(scope), readWorkRecord(scope)]);
if (!header || !record) engineerOrderNotFound({ number });

// getPortalOrder
const scope = customerWork(await currentCustomer(), number);
const [header, record] = await Promise.all([portalOrderHeader(scope), readWorkRecord(scope)]);
// record.notes: a type error

// getOrder: the record replaces its units tree and getWorkReport (notes and sign-off come along)
const record = await readWorkRecord(officeOrder(number));

// loadWorkOrder(where, unitsAt): the `sees` filter becomes SQL; the first-site fallback goes
const record = await readWorkRecord(printedWorkOrder(where, unitsAt));
```

## Cohesion statement

- **Single responsibility:** reads what was done on an order's site, as its audience may see it.
- **What it owns:** the audience table; the scopes; the units at their sites and the sites rule;
  the notes and sign-off reads; the engineer's name per audience; the sign-off and notes
  components; the unit line.
- **What stays out:** prices, totals, tags, history, the request (office's `getOrder`); checklists
  (the module's work order); the order's header columns (each caller); the gates; the shells; the
  unit and location pages. A key in the audience table that doesn't change the record's shape (a
  `prices` flag) is the sign it's growing into a god object.

## Dependency strategy

Local-substitutable: drizzle on libsql in the server spec harness. Scopes build on C4's
`engineerOrder()` and the customer helpers.

## Testing strategy

- **New `src/tests/unit/lib/orders/server/work-record.spec.ts`** (harness), one test per audience:
  - office: notes and "collected by" present; another tenant's number is `undefined`;
  - engineer: another engineer's order is `undefined`; no "collected by";
  - customer, site-limited contact: only the units at their sites, the sites from those, the
    engineer by first name, no notes;
  - workOrder: a unitless order of a one-site customer shows that site, of a two-site customer none.
  - Type tests: a customer's record has no `notes` and no `collectedBy`; an engineer's no
    `collectedBy`.
- **`display.spec.ts`:** the unit line's shape and the extras' order (replacing the `unitLine` and
  `unitDetails` cases).
- **Replaced:** `units.spec.ts:124`'s shape assertion on `getMyOrder` (now the engineer case).
- **Changed:** specs and e2e tests asserting the old unit-line texts, the old sign-off layout
  (`portal.test.ts:260`'s office sign-off, `client.test.ts:161` keeps `[data-signoff]`) or the
  first-site fallback (`order-checklists.spec.ts`).
- **Kept:** every e2e test's behaviour; the portals' isolation tests.

## Migration strategy

Single switchover per caller, each commit passing the gate: the reader and its spec; the office;
the engineer portal; the customer portal; the printed work order; the components; the unit line.

## Implementation steps

1. **Reader** (`work-record.ts`, the barrel), test-first: audiences, scopes, `readWorkRecord`, the
   private reads.
2. **Office:** `getOrder` reads the record (units, sites, notes, sign-off); `getWorkReport` goes;
   the order page's work report reads from `getOrder`.
3. **Engineer portal:** `getMyOrder` from `engineerWork()` and the record; its own header read.
4. **Customer portal:** `getPortalOrder` from `customerWork()`; `unitsOfOrders` goes where the
   record covers it (the orders list may keep a units read of its own: check).
5. **Printed work order:** `loadWorkOrder(where, unitsAt)` from `printedWorkOrder()`; the
   first-site fallback goes (`order-checklists.spec.ts`).
6. **Components:** `SignOff` and `NotesList`, used by the three pages; the Svelte autofixer.
7. **Unit line:** the one helper; every call site in Q6's list (the brief for the reader names
   them: `units-card.svelte`, `(field)/my/[number]`, `(field)/my/equipment/[serial]`,
   `units-cell.svelte`, `equipment/list/columns.ts`, `customers/[code]`, `equipment/locations/[id]`,
   `equipment/[serial]`, `units-field.svelte`, `(field)/my/locations/[id]`, the customer portal's
   `unitDetails` callers).
8. **Docs:** `docs/agents/orders.md` (the work record), AGENTS.md's pointer if needed.
9. **Gate:** check, knip, the specs above, and the e2e files of the office order page, both
   portals and checklists' work order (when the machine is free).
