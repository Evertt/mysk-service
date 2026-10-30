---
title: Activity log
summary: Every change to a record is written down, with who made it and what it changed, and the app's live pages and bells are built on it.
section: across
order: 2
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

Every time someone creates, changes or deletes a record, Fieldworks writes an entry: who did it,
what they did, to which record, and for a change, which fields went from what to what ("status:
quote → scheduled"). Work that the system does by itself, such as a daily job that makes an order
from a maintenance plan, is logged too, as "Fieldworks (automatic)".

You meet the log in three places:

- **On a record.** An order, customer, unit or engineer page has an activity card with that record's
  history, and the history of its parts: an order's lines are on the order's card.
- **The Activity page** in the office lists everything. Narrow it by record type, one record, a
  person or a date range. The first page of entries stays live: a change someone makes while you
  look appears at the top. On a page further back, the entries stay where they are and the page
  says how many came in since, with a link to them.
- **The dashboard's recent activity** card shows the latest few.

Two things follow from how it is kept. A form saved without changing anything logs nothing, so the
log isn't padded with empty "updated" lines. And an entry is never written for a change that was
refused or rolled back, so what the log says happened did.

The log is also the source of the [notifications](/wiki/across/notifications) in the bell, and
what tells open pages to [stay live](/wiki/across/live-updates).

<TryIt as="planner" />

<HowItWorks />

`recordActivity(tx, { action, subject, before, after })` is called inside the same
`db.transaction` that makes the change, after making it. Because it uses the transaction, a
rollback takes the entry with it. See <SourceLink path="src/lib/server/activity/log.ts" line={120}>recordActivity</SourceLink>.

- **`action`** is one of `activityActions` (`created`, `updated`, `deleted`, or a verb that says
  more: `scheduled`, `work_started`, `stock_received`). A new one also gets a sentence in the
  messages.
- **`subject`** is the record: its type, id and the label it is known by now (an order number). The
  label is stored, so an entry still reads right after the record is renamed or deleted. A
  `parent` puts the entry on another record's card too.
- **`before` and `after`** give an update's diff. Only `after`'s fields are compared, days and
  moments as ISO strings, and nothing, `null` and `""` count as equal. If nothing differs the
  function logs nothing and returns `false`. See <SourceLink path="src/lib/server/activity/log.ts" line={83}>diff</SourceLink>.
- **Who:** the tenant and user come from the request. A change by the system (`asSystem()`) is
  stored with no user and an empty name. A deleted user's entries keep their name.
- **Changes outside our transactions** (better-auth's member and invitation endpoints) are logged
  with `recordActivityAfter()` once they succeed.

The entry goes in the `activity` table, which is a tenant table like any other: it has the
organization, and an index per subject and per parent. Once the transaction commits, the same call
announces the change to the live queries (`announceChange()`), which is the next page's story.

The log is read through the [access registry](/wiki/internals/permissions): the Activity page and the
feeds only show entries about records the viewer may read, and drop the types of a module the
tenant has switched off. Those entries stay in the database; switch the module back on and they
return.

A new kind of record gets its noun, its page and its field formats in `coreSubjectTypes`
(`src/lib/activity/subjects.ts`), or for a module's records in the `subjects` of its manifest.
Its detail page then shows `<ActivityCard type id />`.

<DocsPointer doc="docs/agents/database.md" section="Activity log" />
