---
title: Condition
summary: The condition of each unit and its components over time, on the NEN 2767 scale from the defects the checklists find, with a status that says what needs attention.
section: modules
order: 3
status: built
covers: [module:condition]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The condition module keeps a record of how each of your customers' units is doing, and of the
**components** inside them (a spring set in a door, for example). In the app it is called
**Components**; its sidebar entry sits after Equipment. It answers one question: which units need
attention, and how soon?

## What it adds

- **A condition on the NEN 2767 scale.** A condition is scored from 1 to 6: 1 Excellent (as new,
  no defects), 2 Good, 3 Fair, 4 Moderate, 5 Poor and 6 Very poor (technically ready for
  replacement). It is made of **defects**: what is wrong, the element it is on (the unit itself or
  one of its components), its **severity** (slight, serious, severe), its **extent** (NEN's classes:
  below 2%, 2–10%, 10–30%, 30–70%, 70% or more of the element) and its **intensity** (initial,
  advanced or final stage), with photos if you like. NEN 2767's tables give each defect a score, and
  the worst defect wins: a condition without defects is 1. A unit's score is the worst of its own
  latest condition and its components'.
- **From the checklists.** When an engineer rejects a point in the engineer portal, the portal asks
  for its defect: severity, extent, intensity and photos, with the score they give shown as they
  pick. When the checklist is completed, its rejected points are the defects of the unit's new
  condition, and each component gets one from its own points. OK and N/A points add no defects, so a
  checklist without rejections records 1. The engineer can add advice on the unit afterwards. Each
  condition is a new record, so the unit keeps a history, and the latest is its condition.
- **A status.** Every unit is **Critical**, **Attention**, **Planned** or **OK**:
  - Critical: the condition is at the critical threshold or worse, or the inspection has expired.
    Plan it within 5 working days.
  - Attention: the condition is at the attention threshold, a point of its inspection was rejected,
    or there is open advice. Take it along at the next visit.
  - Planned: work on it is in the planning.
  - OK: within its interval and the inspection is valid.

  A unit takes the status of its worst component.

- **The Components page.** A list of units with their score and status, a legend explaining the
  statuses and the NEN 2767 scale, the activity log of the units, and an explanation of the four steps: link, monitor, plan,
  carry out and record. The office can record a condition by hand as a correction, with its defects and
  photos and the score shown live, which counts until a newer one, such as the next completed
  checklist's. Conditions recorded as a percentage before NEN 2767 were converted by band (90% or
  more is 1, 80–89% 2, 70–79% 3, 40–69% 4, 20–39% 5, below 20% 6), and the history says from which
  percentage.
- **Components.** On a unit's page the office adds components: a name, the **article** in the parts
  shop it is (a material), and the checklist points that check it. A rejected point of a component
  suggests its article first.
- **Settings.** A manager sets the two thresholds (critical from, by default 5, and attention
  from, by default 4, both between 2 and 6) and whether
  critical units are **planned by themselves**. With that on, each critical unit without an open
  order gets a maintenance order every day: a high-priority quote for the office to plan, to be done
  within 5 working days.

### Where it shows up

- The equipment list gets two columns, the condition score and the status, both sortable and
  filterable.
- A unit's page shows its condition and its components. A customer's page shows the service history
  of its units: the orders and checklists completed and the conditions recorded.
- The dashboard has a tile for the units that are critical or need attention.
- The engineer portal asks for a rejected point's defect, and for advice once a checklist is
  completed.
- In the customer portal, the home page lists the customer's units needing attention, and a unit's
  page shows its score ("3 · Fair") and status as a badge (not its defects or advice).

### Works with

- **Checklists** (enhances, and enhanced by it): without checklists there are no scores from
  inspections, so the condition is only what the office records. See
  [Checklists](/wiki/modules/checklists).
- **Maintenance** adds a unit's next visit to the list as a "Next due" column, see
  [Maintenance](/wiki/modules/maintenance).
- **Materials** are the components' articles, see [Materials](/wiki/modules/materials).
- The **parts shop** says which points an article fixes, see [Parts shop](/wiki/modules/parts-shop).

Condition requires no module.

<TryIt as="planner" />

<HowItWorks />

Condition owns the hooks that the modules around it answer, which makes it the clearest example of
a module that other modules plug into. In `api/extensions.ts` it declares:

- `condition.signals`: SQL that other modules contribute to a unit's row. Checklists give the
  inspection status, which the unit's status takes in; maintenance gives the next visit, which the
  list shows.
- `condition.articles`: the articles of components (materials).
- `condition.checkpoints` and `condition.articleCheckpoints`: the points that check a component
  (checklists give a unit's template points, the parts shop the points a product fixes).
- `condition.list.columns`: columns in its own units list, which checklists extend with its
  inspection column.

Each of these is an **immediate collector** (`collectNow()`): the contributors answer at once,
without awaiting, because the answer becomes part of a list's SQL. For the same reason the status is
computed in SQL (`server/status-sql.ts`) with correlated subqueries, and the same rules exist in
code (`rolledUpStatus()` in `model.ts`) for single records. A statement binds at most 100 values, so
that SQL is written with literal constants, not parameters.

The NEN 2767 tables are in one file, `nen2767.ts`, with a spec that checks every cell. A condition's
score, and each defect's, is worked out on the server and kept on the record, so the lists' SQL only
takes the worst of the latest ones. Photos of defects are in the photo store, served at
`/condition/photos/<id>` to whoever may read the unit's conditions (the access registry's
`conditionPhoto`).

In the other direction condition plugs into the modules it enhances, in `server/index.ts`. With
checklists on, its `checklists.field.rejected` slot asks for a rejected point's defect, and
`checklists.completed` records the unit's and the components' conditions, with those defects, the
moment a checklist is completed. Its daily job (`jobs.daily`) plans critical units for tenants that want it,
as the system through the core's `createOrders()`, so the order is numbered and logged like any
other. Components keep their article and points as plain ids, without a foreign key, because the
modules they refer to are optional. The service history is a view of the activity log
(`server/history.ts`), not a table.

- <SourceLink path="src/modules/condition/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/condition">the module's folder</SourceLink>.
- <SourceLink path="src/modules/condition/nen2767.ts" line={85}>defectScore()</SourceLink>: a
  defect's score from NEN 2767's tables.
- <SourceLink path="src/modules/condition/model.ts" line={192}>rolledUpStatus()</SourceLink>: a
  unit's status with its components'.
- <SourceLink path="src/modules/condition/server/conditions.ts" line={297}>recordChecklistConditions()</SourceLink>:
  a completed checklist's conditions and defects.
- <SourceLink path="src/modules/condition/server/status-sql.ts">status-sql.ts</SourceLink>: the same
  rules in SQL.
- <SourceLink path="src/modules/condition/server/automatic.ts" line={123}>planCriticalUnits()</SourceLink>:
  the daily job.
- <SourceLink path="src/modules/condition/api/extensions.ts">api/extensions.ts</SourceLink>: the
  points others contribute to.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
