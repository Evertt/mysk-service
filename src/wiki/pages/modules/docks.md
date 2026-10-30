---
title: Docks
summary: Live dock state from the Salvo dock hardware, with doors left open escalated to the planner and to a breakdown order.
section: modules
order: 5
status: built
covers: [module:docks]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

Docks is dock time management for customers that use Salvo's dock safety system: a lock on the
truck's wheel, a control panel, a key storage unit and a beacon per dock. The module shows each
dock's state live, keeps a record of every visit, and watches the sectional door, because a door
left open at a dock is a safety risk and an energy cost. Its sidebar entry sits after Equipment.

## What it adds

- **The docks board** at `/docks`. Every dock of every customer site, with its state: **Free**,
  **Occupied** (a truck has checked in), **Loading** (the wheel lock is on, the beacon green) or
  **Fault** (the control panel has a fault, the beacon red). It also shows the beacon, where the key
  is (in the control panel, with the driver or in key storage), the open session with its carrier
  and plate, and the notices the door rules have given. It updates by itself when events come in.
- **Sessions.** A check-in starts a session; a check-out ends it, and the time the door was open
  during it is added up.
- **Door rules.** A door open for 40 minutes or more turns amber and the dock planner gets a notice.
  At an hour or more it turns red, and a **breakdown order** is made on the dock's door, at most one
  open such order per door. Each step acts once per opening.
- **Docks on the customer's page.** A manager adds the docks of a site on its customer's page, where
  a card also lists them with their live state. A customer's site that has docks cannot be deleted.
- **Settings.** A manager makes the integration tokens the Salvo feed posts with.
- **A demo simulation.** For the demo tenant the app drives SHLTR's docks by itself, with a bar to
  play, pause and speed it up.

### Where it shows up

- A unit's page shows its dock usage when the unit is a dock's door.
- The office's bell rings on door alerts.

### Works with

- **Energy** (enhances): a monitored door that is also a dock's door shows the dock's state on the
  energy module's door card. See [Energy](/wiki/modules/energy).

Docks require nothing.

<TryIt as="planner" />

<HowItWorks />

Docks is the module for something fed from outside. Salvo's hardware (or whatever relays it) posts
batches of events, `check_in`, `lock`, `unlock`, `door_open`, `door_close`, `key_moved`, `scp_fault`,
`scp_ok` and `check_out`, to `POST /docks/ingest` with a bearer token. The route is in the module's
`(api)` route group, which the app lets through without a session; its stub guards the handler with
`guardedIntegration()`: a missing or revoked token is a 401, a tenant without the module a 404, and
the handler then runs as the system in the token's tenant. `jsonIngest()` answers 415, 413, 400
and 422 in the shape every module's feed uses.

A batch is validated whole first, then applied in one transaction, in the order of the events' times.
An event id seen before is skipped, so a batch sent twice applies once, and an event older than the
last one at its dock is recorded but not applied. The dock's state is a pure function of the events
(`applyEvent()` in `model.ts`). Then the door rules run, in a transaction per dock, so one that fails
does not hold up the others. They also run when the feed posts an empty batch, as a heartbeat, and in
the daily job, which prunes old events too.

The module plugs into core at these points, in `server/index.ts`: `jobs.daily` for the door rules,
`simulation.run` for the demo, `customers.removingSite` as a vote against deleting a site with
docks, `notifications.rules` for the bell and `access.rules`. A breakdown order is made through
`createOrders()`, and the module declares `orderTypes: ["breakdown"]`, which a tenant cannot hide
while it is on. The full event contract is in the module's own docs.

- <SourceLink path="src/modules/docks/module.ts">module.ts</SourceLink>: the manifest, and <SourceLink path="src/modules/docks">the module's folder</SourceLink>.
- <SourceLink path="src/modules/docks/docs/salvo-events.md">salvo-events.md</SourceLink>: the feed's
  contract.
- <SourceLink path="src/modules/docks/model.ts" line={164}>applyEvent()</SourceLink>: an event
  changes a dock's facts.
- <SourceLink path="src/modules/docks/server/rules.ts" line={111}>checkDoors()</SourceLink>: the door
  rules.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
