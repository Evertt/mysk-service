---
title: Live updates
summary: Open pages refresh themselves when someone changes what they show, through one feed of changes per tab.
section: across
order: 3
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
	import LiveFlow from "#wiki/widgets/live-flow/live-flow.svelte";
</script>

Nobody presses reload in Fieldworks. When a planner schedules an order, the order's page, the
orders list, the dashboard's numbers and the engineer's list of today's work all update a moment
later, in every browser that has them open.

- **A record's page** refreshes when the record changes. If you are editing it and someone else
  saves first, a notice says "Changed by Anouk de Vries, 1 minute ago" with a button that loads the
  latest version, so your save doesn't quietly undo theirs.
- **Lists, the dashboard and the bells** look again when anything of the kinds they show changes. A
  burst of changes (a bulk action on fifty orders) brings one refresh, not fifty.
- **Hidden tabs wait.** A list or dashboard in a tab you aren't looking at refreshes when the tab
  comes back.
- **Each person hears what they may read.** The engineer portal's feed tells an engineer about
  their own orders only, and the customer portal's feed a customer's contact about their own
  records. Engineers and customers are not told who made a change. If a planner takes an order off
  an engineer who has it open, the engineer is told once that it is gone from them, and the page
  leaves instead of showing an error.

Step through what happens between a click and a refreshed page:

<LiveFlow />

<TryIt as="planner" />

<HowItWorks />

There is one feed per shell and tab, not one live query per record. SvelteKit keeps a live query's
stream open until the browser collects it, which made a query per record leak; the one shared
stream is the fix, and a guard spec (`live-by-subject.spec.ts`) keeps it that way.

1. **A change is announced.** `recordActivity()` calls `announceChange()` once its transaction has
   committed. Announcements are kept in memory: on Cloudflare one Durable Object serves every
   request, and on Node one process. See <SourceLink path="src/lib/server/changes.ts" line={65}>announceChange</SourceLink>.
2. **The shell's live query presents them.** The office has `watchTenantChanges`, the engineer
   portal `watchFieldChanges` and the customer portal `watchPortalChanges`, each
   `liveFeed(types, feedFor())`. `feedFor()` keeps the changes to records the viewer may read
   (asking the [access registry](/wiki/internals/permissions)) and decides what their audience
   hears: the office who made the change and the action; the others only whether the record was
   updated or is gone, without the name. See <SourceLink path="src/lib/server/live.ts" line={89}>liveFeed</SourceLink> and <SourceLink path="src/lib/server/live.ts" line={142}>feedFor</SourceLink>.
3. **The answer repeats the last ten seconds** (`FEED_WINDOW`), because a client that reads only the
   latest answer would otherwise miss changes that came in quick succession. It tells them apart by
   when they were made.
4. **The layout hands them to the page.** `provideChangeFeed()` in each shell's layout. A component
   follows its record with `refreshOnRecordChange(() => ({ type, id }), () => getX(key).refresh())`,
   and a list or bell that isn't keyed by one id with `refreshOnActivity(refresh, { types })`. See <SourceLink path="src/lib/components/activity/change-feed.svelte.ts" line={26}>provideChangeFeed</SourceLink>
   and <SourceLink path="src/lib/components/activity/live-activity.svelte.ts" line={20}>refreshOnActivity</SourceLink>.
5. **Catching up.** A page that was loaded before the stream started, or while it reconnected, asks
   `getRecordChangedAt` when its record last changed. An unreadable record answers 0 and not an
   error, so asking tells nothing about whether an id exists.

The only live queries outside a shell's feed are those for a whole type on a module's own page
(`watchSchedule`, `watchEnergy`, `watchDocks`).

<DocsPointer doc="docs/agents/kit.md" section="Staying live" />
