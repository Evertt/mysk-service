---
title: Permissions and the access registry
summary: One place answers "may this viewer read or change this record?", for pages, lists, the activity log and the live feeds alike.
section: internals
order: 3
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Who you are decides which records you reach, not only which pages you open. The rules are the same
wherever a record turns up: on its page, in a list, in the activity log, in a bell, in a live
update.

| Who                         | Reads                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **The office** (planners)   | The organization's records, for the modules the organization has.                                                |
| **Managers** (owner, admin) | Also what only managers see: members, invitations, a customer's portal access and integration tokens.            |
| **A field engineer**        | The orders assigned to them, and every unit and location, because scanning a neighbour's QR code is the product. |
| **A customer's contact**    | Their own customer's orders, units and sites, and only the sites they were given.                                |

What you may not read is not hidden by a message, it is not found. The activity log and the bells
leave out entries about records you can't read. Records of a module the organization has switched
off disappear from every screen, and come back, history included, when it is switched on again.

A change is a separate question from reading. A record can be yours to read but not to change, and
even a record you may change has its own rules about what status moves are allowed now: those
stay in the order lifecycle.

<TryIt as="engineer" />

<HowItWorks />

Two questions are asked, in two places:

- The [gate](/wiki/internals/gates) decides who may **call** a function.
- The **access registry**, `#lib/server/access`, decides which **records** that caller reaches.

The registry has one entry of rules for each subject type (an order, a unit, a customer, a module's
checklist) and each audience (`office`, `engineer`, `customer`, `system`). An audience with no rule
for a type reads nothing of it: deny by default. The viewer is the audience of the gate that
admitted the request, so a member who is both an admin and an engineer is the engineer in the
engineer portal's functions.

Each rule is a SQL condition built from the audience scopes that already exist (`engineerOrders()`,
`customerOrders()`, `inTenant()`), so the condition of a list's `scope` and the answer to "may this
contact read order 12?" are the same condition. Three makers build an entry:
`rows(table, idColumn, byAudience)` for a type with a row, `partOf(parentType, table,
parentColumn)` for a part that follows its parent, and `tenantWide(byAudience)` for a type
without a row. See <SourceLink path="src/lib/server/access/rules.ts" line={132}>rows</SourceLink>
and <SourceLink path="src/lib/server/access/core.ts">the core's entries</SourceLink>.

Code asks with:

- `mayRead(subject)` and `readOrNotFound(subject)` for one record. See <SourceLink path="src/lib/server/access/index.ts" line={78}>mayRead</SourceLink>.
- `readable(subjects)` for a batch, `readableTypes()` for the types the viewer reads at all.
- `visible(type)` and `visibleOrNone(type)` for the viewer's condition on a table, for a list's
  `scope`, a join or a subquery. `visibleOrNone` is for a `where`, where an `undefined` inside
  `and()` would let everything through.
- `mayChange`, `changeOrNotFound`, `changeable` for changes.

A module adds the entries for its own subject types in `server/access.ts`, contributed in its
`server/index.ts` with `contribute(accessRules, () => rules)`, and has no entry for types that
aren't its own. A module the tenant lacks adds none, so its records aren't found.

**Guarded.** `access.spec.ts` fails when a logged type has no rule (or a rule is for a type nobody
logs), when a file that reads the log or feeds changes doesn't use the registry, when a
`*.remote.ts` checks module subjects by hand, when a portal scopes a table that has a rule by the
tenant alone, and when a role name is compared outside the files that own roles.

**Feeds.** `feedFor(viewer)` filters a shell's feed of changes with `readable()` and decides what
each audience hears of a change. When a change takes a record off someone who knew it (an order
off its engineer), they get one `access_revoked` change, then the record is unreadable and the
open page leaves. See [live updates](/wiki/across/live-updates).

The design, its decisions and the steps it was built in are in `docs/plans/permissions.md`.

<DocsPointer doc="docs/agents/kit.md" section="Permissions" />
