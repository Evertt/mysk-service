---
title: Energy
summary: Power and consumption per zone of a customer's building, doors that let energy out, thresholds and alerts that become orders.
section: modules
order: 6
status: built
covers: [module:energy]
---

<script>
  import DocsPointer from "#wiki/parts/docs-pointer.svelte";
  import HowItWorks from "#wiki/parts/how-it-works.svelte";
  import SourceLink from "#wiki/parts/source-link.svelte";
  import TryIt from "#wiki/parts/try-it.svelte";
</script>

The energy module shows a customer's building live: how much power and energy each part of it
uses, which doors are open and what that costs, and when something goes over its limit. An alert can
be made into an order with one click, which is how monitoring turns into work for an engineer.

## What it adds

- **Sites.** A site is one of your customers' locations with a meter. Its setup page holds the main
  connection's contract, the solar panels, the price and emissions of a kWh, and the site's
  **zones** (parts of the site with a meter of their own), the **consumers** in each zone with their
  rated power, and the **doors** whose open time costs energy.
- **The live view.** For each site: the live P1 meter against the peak contract, consumption per
  hour or per day, a comparison per zone, each zone's tone (Nominal, Elevated, Peak load or
  Offline), the door watch with the energy lost per door, and savings advice. A zone's page shows
  its consumers and their estimated share of today's consumption.
- **Thresholds.** Per zone, a maximum power and a maximum consumption per day. Going over raises an
  alert; reaching 85% raises a "near" alert. A new zone gets default thresholds after its first day
  of readings.
- **Alerts.** Zones over or near their thresholds, and doors open too long. Each alert is Open, can
  be made into an order, or resolved. The order is a **repair** of the door's unit when the alert is
  about a door, otherwise a **survey** at the site's customer.
- **A report** page per site, to print or hand to the customer.
- **The customer's own view.** Customers see their sites' power and consumption, against the
  previous period, and what the doors let out, read-only, on a page in the customer portal.

### Where it shows up

- The dashboard has a tile for the open energy alerts.
- A customer's page has a card listing the sites that are monitored. A monitored site cannot be
  deleted.
- The office's bell rings on the alerts the readings raise.

### Works with

Energy requires and enhances nothing. **Docks** enhance it: a door that is also a dock's door shows
the dock's state on the energy door card. See [Docks](/wiki/modules/docks).

<TryIt as="planner" />

<HowItWorks />

Energy is fed from outside, like docks. A gateway on the site posts **aggregates per zone per 15
minutes** and door events to `POST /energy/ingest` with a token a manager made on the module's
settings page; `GET /energy/ingest` returns the token's sites with their zone and door codes, to
set a gateway up. One batch is one short transaction, because on Cloudflare the database is a
Durable Object whose transactions hold every other request. After the readings, `evaluate.ts`
checks the zones that got readings against their thresholds, interval by interval, and every door by
its openings. A breach becomes an alert once per key: a zone's power per local hour, its consumption
per local day, a door per opening. A door alert that is still open follows its opening as it goes on.
Only the last day's breaches raise alerts, so a gateway catching up on last week raises none, while
a door still open since last week does.

Each batch announces its readings as `energy_reading`, a **live type** in the manifest: it is never
logged, but it keeps the open pages live. The manifest also names the order types an alert makes
(`orderTypes: ["repair", "survey"]`) and the customer-portal entry (`portal`). The module
contributes `simulation.run` (a simulation of P1 meters and door sensors for the demo),
`customers.removingSite`, `notifications.rules` and `access.rules`, and declares the `energy.door`
slot that docks fills.

- <SourceLink path="src/modules/energy/module.ts">module.ts</SourceLink>: the manifest, and
  <SourceLink path="src/modules/energy">the module's folder</SourceLink>.
- <SourceLink path="src/modules/energy/docs/ingest.md">ingest.md</SourceLink>: the feed's contract.
- <SourceLink path="src/modules/energy/server/evaluate.ts">evaluate.ts</SourceLink>: readings
  against thresholds.
- <SourceLink path="src/modules/energy/server/alerts.ts" line={92}>orderAlert()</SourceLink>: an alert
  becomes an order.

<DocsPointer doc="docs/agents/modules.md" section="Modules" />
