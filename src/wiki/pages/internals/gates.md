---
title: Remote-function gates
summary: Every server call is made with a gated set, so a function cannot forget its role check and the check runs before the handler on every call.
section: internals
order: 2
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import GateTable from "#wiki/widgets/gate-table/gate-table.svelte";
</script>

Everything the browser asks the server to do, such as loading a list or saving a form, is a **remote
function**, and every remote function sits behind a **gate** that says who may call it. The gate
runs first. If it refuses, the function's own code never runs.

That is why the same URL behaves differently for different people. A planner can load the orders
list; an engineer calling the same function gets a 403 and uses the engineer portal's functions
instead; someone signed out gets a 401. A customer's contact reaches the customer portal's functions and the few that every role may call.

Pick who is calling and see what each gate does:

<GateTable />

<HowItWorks />

A remote function is not written with SvelteKit's own `query`, `form` and `command`. Those can only
be imported in one file, `src/lib/server/remote-functions.ts` (a spec checks), which exports them
in sets, one per gate:

```ts
export const getOrder = forMembers.query(v.string(), async (number) => {
	const { organizationId } = currentTenant();
	// …
});
```

A function that forgets its gate has no way to be written, which is the point.

- **`gated()`** wraps the handler. It runs the gate, then starts the handler as the audience the
  gate admitted (`asAdmitted()`), so a member who is both an admin and an engineer is the engineer
  in the engineer portal's functions. SvelteKit has validated the argument by then. A `Refused`
  that the handler throws (`#lib/server/refused.ts`) becomes a form's field issues, or a 400 for a
  query or command. See <SourceLink path="src/lib/server/remote-functions.ts" line={71}>gated</SourceLink>.
- **The handler does not check the role again.** It reads what the gate admitted: `currentTenant()`,
  `currentUser()`, `await currentEngineer()` or `await currentCustomer()` in `#lib/server/auth`.
  The engineer portal's orders are scoped to the engineer, the customer portal's queries to the
  customer.
- **The sets** are `remoteSet(gate, admits)`: each has `query` (with `.batch` and `.live`), `form`
  and `command`. See <SourceLink path="src/lib/server/remote-functions.ts" line={97}>remoteSet</SourceLink>.
  The checks (`requireMember()` and the rest) are in <SourceLink path="src/lib/server/auth/session.ts" line={133} symbol="requireMember">session.ts</SourceLink>.
- **A module's set** is `moduleRemote("<id>")` (or `moduleRemote(id, "manager" | "engineer" |
"customer")`), called once in the module's `remote-functions.ts`. It adds `requireModule(id)`:
  a tenant without the module gets a 404, as if the function didn't exist. A spec
  (`module-gate.spec.ts`) checks that each module builds its functions from its own set.
- **No `prerender`.** Nothing here is the same for every tenant.
- **What the gate doesn't decide.** It says who may _call_ a function. Which _records_ they
  reach is the [access registry](/wiki/internals/permissions), and every query is still scoped to
  the [tenant](/wiki/internals/tenancy).

In the browser, a page hides a manager's controls with `await canManage()`, but that only hides:
the `forManagers` gate still refuses everyone else.

<DocsPointer doc="docs/agents/tenancy.md" />
