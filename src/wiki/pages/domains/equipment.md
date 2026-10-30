---
title: Equipment
summary: The units installed at customers' sites, their service history, and the QR codes that take an engineer or a customer straight to one.
section: domains
order: 2
status: built
covers: [domain:equipment]
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A **unit** is one machine installed at a customer's site: a door, a dock leveller, a chiller. Under
**Equipment** the office keeps them. For each unit:

- the **serial number** (the unit's address in the app: `/equipment/<serial>`), manufacturer and
  model, and optionally the customer's own name for it, such as "Automatische deur kantine BES-3";
- its **category**, one of the company's own kinds (Sectionaaldeur, Docklevellers, …), each with
  the engineer specialty that services it;
- its **status**: operational, needs service, out of service or decommissioned;
- its **customer**, its **site**, and optionally the **location** at the site;
- when it was installed, and until when its warranty runs.

A **location** is a named place at a site: "Expeditie noord", "Dock 03", "Kantoor 1e", with a hint
how to find it. Locations let the site's units be found by where they are.

## Service history

A unit's page tells its story: a timeline of its installation, every order on it and the end of its
warranty (which may still be ahead), and figures that sum it up: how many orders, how many open,
what the work cost, and how long between repairs. The order that covers several units, such as a
yearly inspection of fifteen doors, counts for a fifteenth in each.

## QR codes

Every unit and every location has a QR code of its own, printed on a label and stuck on. What it
does depends on who scans it:

| Who scans                | It leads to                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **An engineer**          | the unit (or the place) in the engineer portal, with their open orders for it         |
| **A customer's contact** | **Report a breakdown**, with the unit filled in (or the place's units to choose from) |
| **The office**           | the unit's or the place's page in the office app                                      |

The code works only for people who belong: someone signed out is sent to the login page and back
to the same code; someone from another company, or a customer scanning another customer's unit, gets
a "not found", as if there were no such code.

**Printing the labels.** On a customer's site, the label sheet prints the QR labels of its
locations and units: A4 with 3 × 8 labels of 70 × 37 mm, each with a code, the name, the serial
number and where it is. One unit or one location can be printed alone.

<TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**Tables.** `equipment` (the unit), `equipment_location` and `equipment_category`. A unit's site must
be one of its own customer's, and its location one of its own site: both are composite foreign
keys, so the database refuses a mix. A unit with orders can't be deleted, a location with units
can't, and neither can a category in use. Serial numbers are unique within a tenant.

**The codes.** The URL is `/q/<token>`. The token is not the record's id: `newQrToken()` makes 24
hex digits (96 random bits) from the platform's cryptographic random numbers, once, when the record is
made. So a code can't be guessed from another one, and it stays the same when the unit is renamed
or moved. A unique index keeps tokens unique across tenants, which the lookup needs: it is the one
place that reads across tenants on purpose, because the code doesn't say whose it is.

**Scanning** is the route `src/routes/q/[token]/+server.ts`:

1. Signed out: redirect to the login page, back to `/q/<token>` afterwards.
2. `resolveQrCode(token, userId)` finds the unit or location, and the user's membership in _its_
   tenant. None means 404. If the user is a customer's contact, the access registry is asked
   whether they may read that unit or location (their customer's, at a site they see), else 404.
3. If the code is of another of the user's organizations, that becomes their current one.
4. `qrDestination(target, viewer)` picks the page for the viewer's shell: `/my/equipment/<serial>`
   or `/my/locations/<id>`, `/portal/report?unit=<serial>` or `?location=<id>`, or `/equipment/<serial>`
   or `/equipment/locations/<id>`.

Both portals list `/q/[token]` among the routes they own (`shells.ts`), so the page guard doesn't
bounce a scanner away from it.

**Reading a unit** goes through `readUnits(scope)` (`src/lib/equipment/server/units.ts`), which
returns the unit as its audience sees it: the office sees the warranty and a location's QR token,
the engineer the site's contact and access details, the customer's contact only the site's address.
The scopes (`officeUnits()`, `engineerUnits()`, `customerUnits(access)`) take their rows from the
access registry. See [The work record](/wiki/orders/work-record).

- <SourceLink path="src/lib/server/db/schema/equipment.ts" line={81}><code>equipment</code></SourceLink>, <SourceLink path="src/lib/server/db/schema/equipment.ts" line={51}><code>equipment_location</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/qr.ts" line={63}><code>resolveQrCode()</code></SourceLink> and <SourceLink path="src/lib/equipment/server/qr.ts" line={83}><code>qrDestination()</code></SourceLink>
- <SourceLink path="src/routes/q/[token]/+server.ts" line={16}>the <code>/q/[token]</code> route</SourceLink>
- <SourceLink path="src/lib/equipment/labels/labels.remote.ts" line={18}><code>getLabelSheet</code></SourceLink>
- <SourceLink path="src/lib/equipment/detail/service-history.ts" line={67}><code>buildTimeline()</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Units and locations" />
