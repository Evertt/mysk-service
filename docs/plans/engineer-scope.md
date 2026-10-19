# The engineer's portal scope

Candidate C4 of `docs/reviews/architecture-review.md`, after grilling (decisions Q1–Q8 below) and
the design-it-twice step: the "impossible by construction" design, with the "sibling of
`customer.ts`" design's names.

## Problem

- **One security rule, written by hand about eight times.** "An order of the current tenant
  assigned to the signed-in engineer" is `inTenant(order)`/`idInTenant(order, id)` plus
  `eq(order.engineerId, engineer.id)` in: `findEngineerOrder` (`src/lib/orders/server/field.ts`),
  the lifecycle's `scope()` (`src/lib/orders/server/lifecycle.ts`), `getMyWork` and `getMyOrder`
  (`src/routes/(field)/my/portal.remote.ts`), `myOpenOrders` (`places.remote.ts`), and three
  modules: materials' `getFieldMaterials`, checklists' `getFieldChecklists` and
  `findFieldChecklist` (`server/field.ts`), condition's `findFieldUnit` (`server/conditions.ts`).
- **The engineer's id is passed around three ways** (a number, checklists' `Filler`, read from the
  session), so any code holding it can write its own check, and nothing checks that it does.
- **Four refusals for the same case:** `portal_not_found`, `materials_portal_not_found`,
  `checklists_order_not_found`, `condition_order_not_found`.
- **The customer scope is bypassed twice:** `unitsOfOrders` in `client.remote.ts` writes
  `ofCustomer`'s body out by hand; energy's `getClientEnergy` (`client/client-energy.remote.ts`)
  filters by `customerId` itself.
- **Symptoms:** unknown unknowns (a new module's check can be wrong and nothing notices), change
  amplification (a change to the rule touches eight places).

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | An engineer scope beside the customer scope, plus the customer portal's two bypasses moved onto the existing helpers. `qr.ts` (runs before a customer is signed in) and the partner programme's `close.ts` and `partners.ts` stay.                      |
| Q2  | The refusals are unified (not a pure refactor).                                                                                                                                                                                                         |
| Q3  | A source spec stops new hand-written engineer scoping.                                                                                                                                                                                                  |
| Q4  | The scope's tests replace the per-area isolation tests (narrowed by Q8).                                                                                                                                                                                |
| Q5  | A 404 with the core message: `portal_not_found({ number })` when the request named a number, `portal_not_found_plain()` when it used an id. The modules' messages for this go. A checklist or point reached by its own id keeps `checklists_not_found`. |
| Q6  | Units and locations on the QR pages stay visible to all of the tenant's engineers; only orders are scoped.                                                                                                                                              |
| Q7  | The partner programme's `close.ts` keeps taking a customer id: the portal passes the one the gate admitted.                                                                                                                                             |
| Q8  | Only the engineer-vs-engineer cases move to the scope's tests; each section keeps its South-vs-North case in its server spec and its e2e tamper test, as AGENTS.md asks.                                                                                |

## Proposed interface

### `src/lib/server/auth/engineer.ts` (exported through `#lib/server/auth/index.ts`)

```ts
/** How a request named an order: by id (a form's) or by number (the URL's). */
export type OrderRef = { id: number } | { number: string };

/**
 * For a query on `order` (from, joined or `with`): the current tenant's orders assigned to the
 * signed-in engineer. Reads the engineer itself, as `inTenant()` reads the tenant; the gate's
 * lookup is shared, so it costs no query.
 */
export async function engineerOrders(): Promise<SQL>;

/** The one order `ref` names, if it's one of `engineerOrders()`. */
export async function engineerOrder(ref: OrderRef): Promise<SQL>;

/**
 * The one refusal: a 404 that reads the same whether the order is missing, another engineer's or
 * another tenant's.
 */
export function engineerOrderNotFound(ref: OrderRef): never;
```

- **Invariant:** the signed-in engineer's id is read only in this file. `currentEngineer()`
  (`session.ts`) returns the engineer without the id (`Omit<Engineer, "id">`, or the fields callers
  read: the name); `requireEngineer()` stays for the gate and this file.
- **Records written with the engineer** (a checklist's `completedBy`, a condition record's
  engineer) take it from the scoped order (`found.engineerId`): the scope guarantees it's theirs.
- **tx or db:** the helpers return SQL; the caller runs the query on either.
- **Records reached through their order:** the caller joins `order` and adds
  `await engineerOrders()` to its `where`; when it named the record by its own id, it keeps its own
  404 (`checklists_not_found`).
- **The checklists' office path:** `Filler` becomes a role, `"engineer" | "office"`; the office's
  condition is the tenant's (`tenantJoin` already), the engineer's `await engineerOrders()`.

### `findEngineerOrder(runner, ref, action?)` (`src/lib/orders/server/field.ts`)

Keeps the orders' rule (`fieldActions` → `invalid(fieldRefusal(status))` when an `action` is
given) and loses its `engineerId` parameter: `where: await engineerOrder(ref)`, refusal
`engineerOrderNotFound(ref)`. Callers with a number (materials, checklists) use it too.

### Usage

```ts
// getMyOrder
const found =
	(await db.query.order.findFirst({ where: await engineerOrder({ number }), with: {…} })) ??
	engineerOrderNotFound({ number });

// getMyWork, myOpenOrders
.where(and(await engineerOrders(), inList(order.status, openOrderStatuses), onAnyUnit(ids)))

// logHours, addNote, saveFieldMaterials
const found = await findEngineerOrder(tx, { id: input.id }, "work");

// getFieldMaterials, getFieldChecklists
const found = await findEngineerOrder(db, { number });

// lifecycle: scope() and its 404
const where = rule.by === "engineer" ? await engineerOrder({ id }) : idInTenant(order, id);
if (!found) rule.by === "engineer" ? engineerOrderNotFound({ id }) : error(404, m.orders_not_found_plain());

// findFieldChecklist(tx, by: Filler, id)
.where(and(idInTenant(checklist, id), by === "office" ? undefined : await engineerOrders()))

// findFieldUnit(runner, number, equipmentId)
.where(and(await engineerOrder({ number }), …unit on the order…)); if (!found) engineerOrderNotFound({ number });
```

### The customer portal's bypasses

- `unitsOfOrders` (`client.remote.ts`): `ofCustomer(access, orderUnit)` in place of its
  `inTenant(orderUnit), eq(orderUnit.customerId, access.customer.id)`.
- `getClientEnergy`: `ofCustomer(access, customerSite)` in place of its `eq(customerSite.customerId, …)`
  (adds the tenant condition, which the joins already imply).

### The source spec: `src/tests/unit/lib/server/auth/engineer-scope.spec.ts`

Pure checks over `src/**/*.ts` and `*.svelte` files (comments stripped, as in
`src/tests/unit/modules/boundaries.spec.ts`), also run on made-up files to show they find what they
should:

- **R1:** `requireEngineer` is imported or called only in `src/lib/server/auth/**` and
  `src/lib/server/remote-functions.ts`.
- **R2:** `engineer.userId` (the account link, a way back to the id) only in `auth/**` and
  `src/lib/engineers/**` (the office's account form).
- **R3:** in engineer-gated files (those making their remote functions with `forEngineers` or a
  module's engineer set: `src/routes/(field)/**`, `src/modules/*/portal/**`), no `order.engineerId`,
  `inTenant(order)`, `tenantJoin(order,`, `idsInTenant(order,`, or `idInTenant(order,` other than
  writing the order found through the scope (`idInTenant(order, found.id)`); these folders by path,
  and any file making remote functions with `forEngineers`.
- **A type test:** `currentEngineer()`'s result has no `id`.

The office's filters by an engineer it was given (`?engineer=`, the planner, the engineers page)
aren't engineer-gated and hold no signed-in engineer's id: no rule matches them.

## Cohesion statement

- **Single responsibility:** says which of the tenant's orders the signed-in engineer may reach.
- **What it owns:** the engineer's id from the session; the "assigned to them" condition, by id or
  number; the one refusal; the rule's spec.
- **What stays out:** the gates (`requireEngineer` in `remote-functions.ts`); the orders' status
  rules (`fieldActions`, the lifecycle table); what each portal selects; units and locations (Q6);
  the office's filters by engineer; the checklists' office path, a module decision; the customer
  scope's helpers (only their two bypasses change).

## Dependency strategy

Local-substitutable: plain drizzle SQL, run against libsql by the server spec harness
(`src/tests/unit/lib/server/harness/`), which signs in engineers. The session read is
`requireEngineer()`'s per-request lookup, shared with the gate.

## Testing strategy

- **New `src/tests/unit/lib/server/auth/engineer.spec.ts`** (harness): as North's engineer A,
  B's order and South's order are not found, by id and by number, with the right message each; the
  list holds A's orders only; a missing order reads the same. Plus the helpers' SQL shape, as
  `customer.spec.ts` does.
- **The source spec** above, with its made-up files (flagged: a portal file comparing
  `order.engineerId`; a module importing `requireEngineer`; passed: the office's `?engineer=` filter).
- **Removed** (moved to the scope's tests, Q8): the engineer-vs-engineer cases in
  `src/tests/unit/routes/(field)/my/portal.spec.ts:143-160`,
  `src/tests/unit/lib/orders/server/lifecycle.spec.ts:467`, checklists `portal.spec.ts:271`,
  condition `conditions.spec.ts:341`; each area keeps one case that its refusal is the core message,
  and its South-vs-North case.
- **Kept:** every e2e tamper test; the checklists office-path tests; the customer portal's specs
  (the two bypasses are covered by `portal.spec.ts`'s "another customer's records" and energy's
  `sites.spec.ts`).
- **Messages:** tests asserting the three removed module messages switch to the core one.

## Migration strategy

Single switchover in a few commits, each passing the gate: the scope and its tests; the callers
(core, then modules) with `currentEngineer()` narrowed last, so the compiler lists any caller left;
the source spec; the customer bypasses; docs.

## Implementation steps

1. **Scope** (`engineer.ts`, its spec, the barrel). Tests first.
2. **Core callers:** `findEngineerOrder(runner, ref, action?)`, the lifecycle's `scope()` and its
   404, `getMyWork`, `getMyOrder`, `myOpenOrders`, `logHours`, `addNote`, `startWork`,
   `completeWork`. Trim `portal.spec.ts` and `lifecycle.spec.ts` as above.
3. **Modules:** materials (`getFieldMaterials`, `saveFieldMaterials`), checklists (`Filler` as a
   role, `findFieldChecklist`, `findFieldPoint`, `getFieldChecklists`, `completedBy` from the order),
   condition (`findFieldUnit`, `adviseFieldCondition`, its engineer from the order). Drop the three
   messages (en and nl). Trim their engineer-vs-engineer tests.
4. **Narrow `currentEngineer()`** (no `id`); fix what the compiler finds; the type test.
5. **Source spec** with its made-up files.
6. **Customer bypasses:** `unitsOfOrders`, `getClientEnergy`.
7. **Docs:** `docs/agents/tenancy.md` (the engineer scope beside the customer's), AGENTS.md's
   Tenancy bullet names `engineerOrders()`/`engineerOrder()`.
8. **Gate:** check, knip, the specs above, the portal, checklists, condition, materials and customer
   portal e2e files.
