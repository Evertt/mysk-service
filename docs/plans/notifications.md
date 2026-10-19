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
