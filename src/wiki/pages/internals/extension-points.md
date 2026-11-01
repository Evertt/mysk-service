---
title: Extension points
summary: How an optional module adds to core pages and logic without core knowing it exists, through slots, hooks and generated registries.
section: internals
order: 4
status: built
covers: []
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
</script>

When a company switches the **materials** module on, its orders gain material lines in the order
form, the price includes them, stock follows the order's status, a unit's page shows its parts, and
the dashboard gets a low-stock tile. Switch it off and all of that is gone, as if the app had never
had it. The core app, the part that every company has (orders, customers, equipment, engineers),
does none of this itself and never mentions materials.

That works through **extension points**: places where the core says "anything that is switched on
may add something here". A module, never the other way round, plugs in. The points fall into a few
kinds:

| Kind            | The module adds…                               | Example                                               |
| --------------- | ---------------------------------------------- | ----------------------------------------------------- |
| **Slot**        | a card or tile to a core page                  | `orders.detail.side`, `dashboard.cards`               |
| **Form slot**   | inputs to a core form, validated with it       | the order form's `orders.form`                        |
| **Bulk action** | an action on a list's selected rows            | `orders.list.bulk`                                    |
| **List column** | a column to a server-side list                 | `equipment.list.columns`                              |
| **Collector**   | its part of an answer, such as a cost          | `orders.costs`, `notifications.rules`, `access.rules` |
| **Event**       | a reaction after a change is committed         | `orders.committed`                                    |
| **Vote**        | a refusal, if it must stop something           | `customers.removingSite`                              |
| **Save hook**   | its part of a save, in the owner's transaction | `orders.saving`, `orders.units`                       |
| **Daily job**   | work to do once a day, as the system           | maintenance's plans that become orders                |

A page that shows what a slot contributes puts each part in its own boundary. If a module's card
fails, that card shows a notice and the rest of the page carries on.

<Diagram viewBox="0 0 440 170" label="A core page offers a slot. Modules that are on, such as materials and condition, contribute to it. A module that is off does not.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="10" width="150" height="150" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="79" y="30" font-weight="600" fill="var(--foreground)">Core page</text>
		<text x="79" y="48" fill="var(--muted-foreground)">a unit's page</text>
		<rect x="8" y="62" width="142" height="34" rx="6" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="4 3" />
		<text x="79" y="83" fill="var(--foreground)">equipment.detail.side</text>
		<rect x="262" y="10" width="174" height="40" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="349" y="35" fill="var(--foreground)">materials: on</text>
		<rect x="262" y="65" width="174" height="40" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="349" y="90" fill="var(--foreground)">condition: on</text>
		<rect x="262" y="120" width="174" height="40" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="4 3" />
		<text x="349" y="145" fill="var(--muted-foreground)">docks: off, adds nothing</text>
		<path d="M 260 30 C 210 30 190 79 152 79 M 260 85 C 220 85 190 79 152 79" fill="none" stroke="var(--primary)" stroke-width="1.5" />
	</g>
</Diagram>

<HowItWorks />

**A module is a folder.** Everything of an optional module is in `src/modules/<id>/`, and core never
imports from it. A module's tables reference core tables, never the reverse. Because the module
doesn't import core's pages and core doesn't import the module, the link has to be found another
way: a generator.

**The generator** (`scripts/modules.ts`, run by `pnpm generate` and when Vite loads) reads the
module folders and writes the registries that core does import: the manifests, the hooks, the
slots' contributions, the form parts and the list columns (`*.gen.ts`, gitignored). A module
contributes by putting a file in a folder named for the point: `slots/orders.detail.side/…`,
`columns/equipment.list.columns.ts`, `form-parts/orders.form.ts`. See <SourceLink path="src/lib/extensions/define.ts" line={167}>defineSlot</SourceLink> for how a point is
declared.

**Points are declared by their owner.** Core declares its points in `src/lib/<domain>/extensions.ts`
(`orders.costs`, `orders.saving`, `customers.removingSite`), and a module declares its own for
other modules to use (`invoices.billableItems`). A record's slots, list columns and bulk actions
are one call, `defineRecordPoints("orders", { … })`.

**Server-side points** go through a kernel. A module contributes in its `server/index.ts`:

```ts
export default defineServerModule("materials", [
	contribute(costs, materialCosts),
	contribute(saving, saveOrderMaterials),
]);
```

and the owner calls the kernel for the modules that are on, in dependency order: `collect()` for
collectors, `emit()` for events after commit, `vote()` for votes (any refusal wins), `save()` for
save hooks (the first problems stop the rest, and the owner rolls back). A module that is off is
never asked. See <SourceLink path="src/lib/server/extensions.ts" line={80}>contribute</SourceLink> and <SourceLink path="src/lib/server/extensions.ts" line={115}>defineServerModule</SourceLink>.

**Dependencies** are `requires` and `enhances` in a module's manifest. A module whose requirement
is off is off everywhere, and the settings page switches modules on and off together with what
they need and what needs them.

Pages that show a point load its contributions with `loadContributions()` (never by filtering the
generated file by hand), and render slots in `<ExtensionSlot>`, which is the error boundary. A
guard spec refuses the hand-written forms.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
