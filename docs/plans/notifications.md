# Notifications

Wish 8 of 19 October 2026, after grilling (Q14, Q15). This is a bell in the top bar with a tray of
what happened that the user should know about. It's not push notifications.

**Builds on the engineer portal's scope** ([engineer-scope.md](engineer-scope.md), branch
`engineer-scope`). Merge that first, because the engineer's bell is scoped through it.

## Problem

Everything that happens is in the activity log (`activity` table, `src/lib/server/db/schema.ts:819`;
`/activity`; the dashboard's recent activity). It's everything, though, so the few entries a user
must act on or would want to know about drown in it. Nothing is per user:

- There's no "read" state. The `user` table has only the account's fields.
- No one follows or watches a record.
- Being assigned to an order (`order.engineerId`) is the only personal link to a record.

## Decisions (grilling)

| #   | Decision                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q14 | The office bell collects four kinds: **customer reports**, **system-raised alerts**, **field progress**, and **changes to my records**. Everything else stays only in the activity log. |
| Q15 | The **engineer portal gets a bell too**, for orders assigned or planned to the engineer, moved to another time, or taken off them.                                                      |
| —   | Opening the tray marks everything shown as read, and the bell's dot goes away. Per user, per organization.                                                                              |

## Design

### Worked out from the activity log

- **Notifications aren't stored per user.** They're activity entries that match a rule, newer than
  what the user has seen, and not made by the user themselves.
- **Why:**
  - Nothing is written for each user on each change, so there's no fan-out and nothing to clean up.
  - A rule added later also covers past entries.
  - The log is already the place every change goes through (`recordActivity()`).
- **Read state:** one row per user per organization, in a `notification_seen` table:
  - `organizationId`, `userId` and `lastSeenActivityId`
  - The activity id is used, not a time, because ids only grow, so there's no clock skew and a
    change during the same second isn't lost.
  - It's a tenant table with a composite foreign key, as every tenant table has. Read
    `docs/agents/database.md` and `docs/agents/tenancy.md` first.
- **The window:** the last 30 days, at most 50 entries in the tray. The dot counts unread ones up to
  a cap, shown as "9+".

### Rules

- **A rule is a value:**

  ```ts
  { id, audience: "office" | "engineer", category, where: (ctx) => SQL }
  ```

  - `where` filters `activity` by `action`, `subjectType` and, where needed, its `changes` JSON or
    its actor.
  - `ctx` gives the current user, and the engineer's scope through the helpers in
    `src/lib/server/auth/engineer.ts`. The engineer's id is read only there; this plan doesn't
    break that rule, and the source spec from the engineer-scope plan checks it.

- **Core rules** go in a notifications folder, wherever `docs/agents/structure.md` points (likely
  beside `src/lib/activity/`).
- **Modules add their own** through a new extension point (read `docs/agents/modules.md`). A
  switched-off module's rules don't apply.
- **Office rules**, by category:
  - **Customer reports:**
    - an order created with the status `awaiting_acceptance` (`requestOrder()`, a breakdown
      reported in the customer portal)
    - parts-shop orders `placed` by a customer contact (the parts-shop module's rule)
  - **System-raised alerts:** entries by the system user (`isSystemUser`,
    `src/lib/server/auth/system.ts`), each module's own:
    - maintenance's automatic orders
    - docks' `door_alert` and `door_escalated`
    - energy's `alert_ordered`
    - condition dropping below a threshold, if it's logged; if it isn't, say so here and leave it
  - **Field progress:**
    - an order's `work_started` and `completed` by an engineer
    - checklists' completion with rejected points (the checklists module's rule)
  - **Changes to my records:** an entry by someone else on a subject that you created (its
    `created` entry is yours), or where the entry before it on that subject was yours. This is
    implicit following, with no follow button.
- **Engineer rules**, only on orders in the engineer's scope or that just left it:
  - **Assigned to you:** `changes.engineerId` becomes you.
  - **Planned or moved:** the planned time changes while the order is yours.
  - **Taken off you:** `changes.engineerId` was you before.
  - **Cancelled or deleted while yours.**

  Check what the order's entries record (`assignOrder()` logs `engineerId` before and after;
  planning and the order form may log other fields). Where a rule can't be read from the log, add
  what's missing to the entry rather than writing a second record.

- **Never** your own entries, and never another tenant's: the query starts from
  `inTenant(activity)`.

### The bell and the tray

- **Where:**
  - The office app: `src/routes/(app)/app-header.svelte`, before `SyncIndicator`.
  - The engineer portal: its header in `src/routes/(field)/+layout.svelte`.
- **Each shell gets** a `forMembers` / `forEngineers` query for the tray's entries, a live count for
  the dot (`query.live` with `live()`, `src/lib/server/live.ts`), and a command
  `markNotificationsSeen(upToId)`.
- **Opening the tray:**
  - Shows the entries grouped by day, using the activity list's sentence for each, with an icon per
    category, the relative time and a link to the subject (`subjectHref()`).
  - Entries that were unread when it opened are highlighted.
  - Opening sets `lastSeenActivityId` to the newest entry shown, not to "now", so an entry that
    arrives while the tray is open stays unread.
  - The office tray links "All activity" to `/activity`.
- **Empty state:** "Nothing new".
- **Live streams keep the Durable Object awake** (`docs/plans/cloudflare.md`). Check whether the
  shell already holds a live stream that can carry the count, before adding another per tab.
  Measure with the timing lines of [error-handling.md](error-handling.md) if that's merged.
- All text is in Paraglide `en` and `nl`.

## Steps

1. The `notification_seen` table, the rule type, the core rules, and the query that applies them,
   with server specs.
2. The modules' extension point and their rules.
3. The office bell and tray, then the engineer's.

## Tests

- **Unit:** each rule's matching, as far as it's pure.
- **Server spec:**
  - Each category with an entry that matches and one that doesn't.
  - Your own entries are excluded.
  - "Changes to my records" handles both created and last-edited.
  - The engineer's rules work: engineer A never sees B's orders, but does see an order taken off
    them.
  - Marking as seen up to an id leaves newer entries unread.
  - South never sees North's entries, also with a tampered `upToId`.
- **e2e:**
  - A breakdown reported in the customer portal puts a dot on the office bell. Opening the tray
    shows it and clears the dot.
  - Assigning an order to an engineer puts a dot on their bell in the portal.

## Out of scope

Push and email notifications, per-user settings for which categories to see, dismissing single
entries, and a "mark as unread".

## As built

- **Read state:** `notification_seen` (`organization_id`, `user_id`, `last_seen_activity_id`,
  `updated_at`), primary key on the first two. Its composite key is
  `(organization_id, last_seen_activity_id)` → `activity (organization_id, id)`, for which the
  index `activity_organization` became the unique `activity_organization_id`: the database refuses
  another tenant's entry as the marker. `markNotificationsSeen(upToId)` checks the entry first (a 404) and never moves the marker back (`max()` on conflict). It isn't logged: it's personal, like
  `table_memory`.
- **Rules and the query:** the rule type and the extension point (`notifications.rules`, an
  immediate `skip` collector) are in `src/lib/notifications/extensions.ts`; the core's rules, the
  conditions modules build theirs from (`entryAbout()`, `bySystem`, `subjectNumber`) and the query
  in `src/lib/server/notifications/`. All rules of an audience are one `case` in one statement (the
  first that matches gives the category), with constants written in, so it binds only the user,
  the tenant and the window. `notificationsFor(audience)` reads the request once (tenant, user,
  modules, the engineer's conditions), so a live query can ask again after a change.
- **Office rules:** customer reports: `orders.reported` (an order's `created` entry with an
  `order_request` row) and `parts-shop.placed`; alerts: `orders.automatic` (an order the system
  created: maintenance's due plans, condition's critical units and a dock door's escalation alike,
  as the order's entry can't tell which module made it), `docks.doorAlerts` (`door_alert`,
  `door_escalated` by the system) and `energy.alerts` (an `energy_alert` the system created);
  field progress: `orders.fieldProgress` (`work_started`, `completed`) and `checklists.rejected` (a
  checklist completed with a rejected point; completed checklists don't change, so its results now
  are those it was completed with); changes to my records: `records.mine`, on any subject type.
- **Engineer rules** (`orders.cancelled`, `orders.unassigned`, `orders.assigned`, `orders.planned`,
  in that order): `engineerActivity()` in `src/lib/server/auth/engineer.ts` builds their conditions
  (`changes.engineerId` was or became theirs; an order of theirs now through `engineerOrders()`),
  so the engineer's id stays in that file. "Planned or moved" and "cancelled" read whether the
  order is theirs now; the rest read the entry.
- **Added to the entries:** an order created with an engineer logs `engineerId` (none → them), and
  deleting an assigned order logs it (them → none); the deletion is "cancelled" for the engineer
  (that rule comes before "taken off"). Nothing else was missing: assignments, plans and the order
  form log `engineerId`, and plans `scheduledFor`.
- **Deviations:**
  - Energy's `alert_ordered` is someone's own doing (the office makes an alert into an order), not
    system-raised: energy's rule is the alert the readings raise instead.
  - Condition dropping below a threshold isn't logged (only the recorded score is); its automatic
    orders for critical units are, as `orders.automatic`. Maintenance has no rule of its own for
    the same reason.
  - The parts shop's rule takes every `placed` entry: only a customer's contact places an order.
- **Live streams:** the office's shell held one already (the sidebar's badge,
  `watchAwaitingAcceptance`). It became `watchShell` (`src/routes/(app)/shell.remote.ts`), which
  answers both counts on any change, so the bell adds no stream. The engineer portal's shell held
  none, but its pages hold `watchMyWork`; the bell's count is a plain query
  (`getMyUnreadNotifications`) that `watchMyWork` refreshes (the same stream, shared). The tray is
  a plain query read when it opens. Not measured: error-handling's timing lines aren't merged.
  The server's count lags after marking until the next change; the page hides the dot up to the
  entry it marked (`showsDot()`), and other tabs catch up on the next change.
- **Tray:** `#lib/components/notifications/notification-bell.svelte`, with
  `activity-sentence.svelte` taken out of the activity list for the sentence; each shell's
  `notification-bell.svelte` gives its remote functions. Changes show on one muted line. The
  engineer's entries link to `/my/<number>` while the order is theirs. Each opening reads the tray
  afresh, showing a skeleton (`aria-busy`) rather than the last tray, whose highlights were of
  then: the engineer's e2e read the old tray's first unread entry before the new one was in. Days
  are grouped by a map and sorted, as the demo data's entry times aren't in id order. In the
  desktop's phone frame the tray keeps within the portal's column (`boundary`, its width the
  space bits-ui leaves it).
- **Checked by hand** (dev server, SHLTR): the office's bell, its dot and tray at desktop and
  phone width; the engineer portal's in the desktop phone frame and at phone width (its empty
  state). At phone width the portal's header is crowded: the name shrinks to its first letter
  next to six buttons (the bell, language, theme, mode, view-as, sign out), and bug-recorder adds
  one more; the header wants a menu for some of them.
- **Open:** the query scans the tenant's entries of the window until it has 50 matches; a tenant
  with a very busy log and few notifications would want an index on `activity (organization_id,
created_at)` or an id bound for the window.
- **Learned:** drizzle wraps an embedded query in parentheses (write `exists ${subquery}`, not
  `exists (${subquery})`); `literal()` refuses JSON paths (`sql.raw` for code constants); a rule's
  subquery is built per request, never at module scope (`db` is the request's on Cloudflare).
