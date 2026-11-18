---
title: Manuals and documents
summary: A unit's manuals, certificates, drawings and CE declarations, which the office uploads and the engineers and the customer's contacts open on their phones.
section: domains
order: 4
status: built
covers: []
---

<script>
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

A unit comes with paper: the manufacturer's manual, an inspection certificate, a drawing of how it
was built in, its declaration of performance with the CE mark. Fieldworks keeps them with the unit,
so whoever stands in front of it can open them on their phone.

Each document has a **title** ("Gebruikershandleiding Crawford SD 4000"), a **kind** (manual,
certificate, drawing, declaration of performance / CE, or other) and its file: a PDF, a photo or
scan (JPEG, PNG or WebP), or a Word or Excel file, of at most 25 MB.

## Who does what

- **The office** uploads documents on the unit's page, in its Documents card: a title, the kind and
  the file. It renames a document or changes its kind, and deletes one after a question. This works
  without JavaScript too.
- **The engineers** see a unit's documents on the unit in their portal, where its QR code leads
  them, and tap one to open it.
- **The customer's contacts** open them from the unit's page in the customer portal, under
  **Manuals & documents**, which says how many there are. A contact the office invited for some
  sites only sees the documents of the units at those sites.

A PDF or an image opens in the browser; a Word or Excel file is saved under the name it was
uploaded with. Nobody else, and nobody in another organization, gets a document: a link to one is a
"not found" for them.

Every document added, renamed or deleted is in the unit's activity, with who did it.

<TryIt as="planner" /> <TryIt as="engineer" /> <TryIt as="customer" />

<HowItWorks />

**One table, one route.** Every document is an `equipment_document` row, a part of its unit: a
composite foreign key to `equipment` with the tenant, deleted with it. It keeps the title, the kind,
the file's key, its type and size, the name it was uploaded with, who uploaded it and when. The file
is in the file store the orders' photos use (the `PHOTOS` R2 bucket on Cloudflare, `PHOTOS_DIR`
elsewhere), under keys of its own: `<tenant>/equipment/<uuid>.<ext>`. `/documents/<id>` serves it
(`serveUnitDocument()`) with `Content-Disposition: inline` for a PDF or an image and `attachment`
otherwise, the original name, and `nosniff`.

**Who may do what** is the access registry's `equipment_document` rule, `partOf("equipment", …)`:
whoever reads the unit reads its documents (the office, every engineer, a contact of the unit's
customer at a site they see), and whoever changes the unit (the office) changes them. One query
reads them in every shell (`getUnitDocuments`, `forAnyRole`: the registry decides the unit), the
office's forms change them (`forMembers`).

**Checked by its bytes.** The type the browser sends doesn't count: the server reads the file's
first bytes (`%PDF-`, JPEG, PNG and WebP's signatures, an Office file's ZIP with `word/` or `xl/`
entries) and refuses anything else, or a file over 25 MB, before anything is stored.

**Files and transactions.** The same helpers as the photos' (`#lib/server/files/stored.ts`): the
upload stores the file first, outside the transaction, and deletes it again if the transaction
fails (`withStoredFiles()`); deleting a document or its unit deletes the file once the transaction
has committed (`discardFiles()`, the unit's through `defineRemoval()`'s `afterwards`); the daily run's
`sweepUnitDocuments()` deletes day-old files under the documents' prefix that no row points to
(`sweepFiles()`), which the photos' sweep never lists.

**The demo.** The seed gives SHLTR's units a few small PDFs: a manual and a CE declaration on the
Sectionaaldeur D-07 at Riedel, a manual, a certificate and a drawing on others. Their files go to
the local store; on Cloudflare the seed doesn't reach the bucket, so they are listed there but open
only once uploaded again.

- <SourceLink path="src/lib/equipment/server/documents.ts" line={100}><code>addUnitDocument()</code></SourceLink>
  and <SourceLink path="src/lib/equipment/server/documents.ts" line={173}><code>removeUnitDocument()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/documents.ts" line={246}><code>serveUnitDocument()</code></SourceLink>
- <SourceLink path="src/lib/equipment/server/documents.ts" line={224}><code>sweepUnitDocuments()</code></SourceLink>
- <SourceLink path="src/lib/server/files/stored.ts" line={122}><code>sweepFiles()</code></SourceLink>
  and <SourceLink path="src/lib/server/files/stored.ts" line={163}><code>serveStoredFile()</code></SourceLink>
- <SourceLink path="src/lib/server/access/core.ts" line={132}><code>equipment_document</code></SourceLink>
- <SourceLink path="src/lib/equipment/documents/documents.remote.ts" line={33}><code>getUnitDocuments</code></SourceLink>
- <SourceLink path="src/lib/server/db/schema/equipment.ts" line={144} symbol="equipmentDocument"><code>equipment_document</code></SourceLink>

<DocsPointer doc="docs/agents/orders.md" section="Photos" />
