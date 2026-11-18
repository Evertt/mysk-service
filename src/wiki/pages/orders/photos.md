---
title: Photos of an order
summary: Who adds photos to an order and when, who may delete them, where they show, and how their files are kept and cleaned up.
section: orders
order: 6
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

An order can carry photos: of the fault, the type plate, the work done. Three kinds of people add
them:

- **the customer**, up to five when they report a breakdown in the customer portal (see
  [Orders awaiting acceptance](/wiki/orders/awaiting-acceptance));
- **the engineer**, on site, from the order in their portal, while they work on it (planned, on the
  way or under way);
- **the office**, on the order's page, until the order is invoiced.

The phone or browser shrinks each photo before sending it, so even a large phone photo goes up as
a few hundred KB. Without JavaScript the photos go as they are, up to 10 MB each and 25 MB at once.

## Who may delete a photo

- **The office** may delete any photo of an order, at any time.
- **Whoever added a photo** (the engineer, the customer's contact) may delete it, as long as the
  order is still to be done: not once it is completed, invoiced or cancelled. An engineer who is
  taken off the order can no longer delete theirs.
- Nobody else, and nobody in another organization, sees a delete button or gets past the server.

Every photo added or deleted is in the order's activity, with who did it.

## Where photos show

- The order's page in the office, with a photos card that adds and deletes them.
- The engineer's order, with the same card.
- The customer's order page, on the card of their report.
- A unit's service history: in the office small thumbnails per order, in the engineer portal (a
  scanned unit's orders) and the customer portal (Service history) a count per order.

<TryIt as="engineer" /> <TryIt as="planner" />

<HowItWorks />

**One table, one route.** Every photo is an `order_photo` row (a tenant table whose rows go when
their order is deleted), with who added it (`userId`) and its place among the order's photos. The
file is in the photo store: the `PHOTOS` R2 bucket on Cloudflare, a folder elsewhere (`PHOTOS_DIR`),
under keys that start with the tenant's id. `/photos/<id>` serves a photo only to whoever may read
its order (`servePhoto()`), and is a 404 for anyone else, also for a tampered id.

**Who may do what** is the access registry's `order_photo` rule: a part of `order`, so whoever reads
the order reads its photos. Its change (deleting) is the office's for all of them; engineers and
customers' contacts get a change of their own through `partOf()`'s `changedBy`: of the orders they
read, the photos they added while the order is in `pendingOrderStatuses`. `photosOf()` tells each
page per photo whether the viewer may delete it. Adding goes by the change of `order` (the office,
or the order's engineer) and `mayAddPhotos()` for its status.

**Adding** is `addPhotos`, and **deleting** `deletePhoto`, one form each for every shell
(`forAnyRole`: the registry decides the rest). Adding stores the files first, outside the
transaction (`withStoredPhotos()`), since on Cloudflare a transaction holds every other request;
then the transaction records and logs them. Should it fail, the stored files are deleted again.
The picker (`photo-picker.svelte`) shrinks each photo to 1600 pixels as a JPEG; the server checks
every file again by its bytes (JPEG, PNG or WebP) and its size.

**Clean-up.** Deleting a photo or an order deletes the rows in a transaction, then the files once it
has committed. Whatever is missed (a server that stopped in between, a delete that failed, an order
deleted with its customer) the daily run's `sweepOrderPhotos()` deletes: files of the tenant that no
row points to, once they're a day old, so a form still being sent keeps its files. Both the folder
and the bucket list their files by a prefix for it.

**Shared with the units' documents.** Storing before the transaction, deleting after it, the sweep
and serving a file are one set of helpers, `#lib/server/files/stored.ts`, which the units'
[documents](/wiki/domains/unit-documents) use too: `withStoredFiles()`, `discardFiles()`,
`sweepFiles()` (by a key prefix and a query of the keys rows point to) and `serveStoredFile()`. The
photos' keys start with `<tenant>/orders/`, the documents' with `<tenant>/equipment/`, so one sweep
never sees the other's files.

**Request sizes.** Workers take 100 MB a request. A Node server of your own (`adapter-node`) takes
`BODY_SIZE_LIMIT`, 512 KB unless set: set it to `26M` (README.md).

- <SourceLink path="src/lib/orders/server/photos.ts" line={190}><code>addPhotosLater()</code></SourceLink>
  and <SourceLink path="src/lib/orders/server/photos.ts" line={208}><code>removeOrderPhoto()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={106}><code>withStoredPhotos()</code></SourceLink>
- <SourceLink path="src/lib/server/files/stored.ts" line={87}><code>withStoredFiles()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={290}><code>sweepOrderPhotos()</code></SourceLink>
- <SourceLink path="src/lib/orders/server/photos.ts" line={311}><code>servePhoto()</code></SourceLink>
- <SourceLink path="src/lib/server/access/core.ts" line={123}><code>order_photo</code></SourceLink>
- <SourceLink path="src/lib/orders/photos.remote.ts" line={21}><code>addPhotos</code></SourceLink>
  and <SourceLink path="src/lib/orders/photos.remote.ts" line={29}><code>deletePhoto</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/orders.ts" line={206} symbol="orderPhoto"><code>order_photo</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Photos" />
