---
title: Notifications
summary: The bell in the office's and the engineer portal's header shows the few log entries you should act on or know about.
section: across
order: 4
status: built
covers: []
---

<script>
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

The [activity log](/wiki/across/activity-log) records everything, so the few things that need you
would drown in it. The bell picks them out. A dot on it counts what came in since you last opened
it (up to "9+"), and the tray lists the newest fifty from the last thirty days, by day, each with
an icon for its category and the log's own sentence.

**In the office** the bell tells a planner about:

- **Reports.** A customer reported a breakdown in their portal and it waits for acceptance.
- **Alerts.** The system made an order by itself: a maintenance plan came due, a unit's condition
  went critical, a dock door stayed open too long. A door alert from the docks module counts too.
- **Field.** An engineer started or completed an order, or a checklist was completed with a point
  that failed.
- **Mine.** Someone changed a record that you created or last changed.

**In the engineer portal** the bell tells an engineer when an order is assigned to them, taken off
them, planned for another time, or cancelled while theirs.

Your own changes never ring your own bell. Opening the tray marks what it shows as seen, up to the
newest entry in it, so something that arrives while it is open stays unread. A tab that is already
open updates the dot by itself ([live updates](/wiki/across/live-updates)).

<TryIt as="planner" />

<TryIt as="engineer" />

<HowItWorks />

There is no notification record. A notification is an activity entry that a rule picks, so the only
thing stored per person is how far they have read (`notification_seen`: the id of the newest
entry their tray showed). The rules are values, `{ id, audience, category, where }`, where `where`
is a condition on the `activity` table, built for each request. A rule added later covers past
entries too, because nothing was stored when they happened.

1. **The core's rules** are in <SourceLink path="src/lib/server/notifications/rules.ts" line={90}>coreNotificationRules</SourceLink>,
   in the order that decides a category: the first rule that matches gives an entry its category.
2. **A module adds its own** with `contribute(notificationRules, () => [...])` in its
   `server/index.ts`. Docks adds `docks.doorAlerts`, checklists `checklists.rejected`. The kernel
   asks only modules a tenant has on, so a module that is off adds none. See <SourceLink path="src/lib/notifications/extensions.ts" line={72}>notificationRules</SourceLink>.
3. **The query** keeps entries of the tenant, other people's (or the system's), newer than 30 days,
   and newer than `lastSeen` for the dot, then picks the category with one `case` over all the
   rules. See <SourceLink path="src/lib/server/notifications/notifications.ts" line={54}>rulesFor</SourceLink>.
4. **The dot is live.** The office shell's live query (`watchShell`) answers again after every
   logged change, and the bell reads the new count from it.

A rule needs only the entry to decide. When it needs more than an entry says, the fix is to add
that to the entry (`changes`), not to store a record of its own. Rules write their constants in
with `literal()` and read the tenant's tables only through correlated subqueries, so a statement
with every rule binds few values. That matters because a statement binds at most 100 values on
Cloudflare.

<DocsPointer doc="docs/agents/modules.md" section="Extension points" />
