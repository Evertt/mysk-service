---
title: Bug reporter
summary: A user records themselves running into a problem, and a developer replays it with the console and the requests beside it.
section: across
order: 6
status: built
covers: []
---

<script>
	import Diagram from "#wiki/parts/diagram.svelte";
	import DocsPointer from "#wiki/parts/docs-pointer.svelte";
	import HowItWorks from "#wiki/parts/how-it-works.svelte";
	import SourceLink from "#wiki/parts/source-link.svelte";
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

"It didn't work" is a hard report to act on. The bug reporter replaces it with a recording.

1. In the office, click the bug icon in the header. In the engineer portal, choose "Report a
   problem" in the header menu. (The customer portal has no recorder.)
2. Do what went wrong. The icon turns into a pulsing red dot with a running timer, so you can see
   the page is being recorded.
3. Click it to stop, or let it stop by itself after ten minutes. Add an optional note and send.

Reloading the page doesn't lose the recording: it is offered for sending once the page is back.

The developers get an email with who, where, the note, the browser and the errors the console
logged, and a link to a replay page. There they watch the session play back as the user saw it,
beside a list of the console's errors and warnings and a list of the requests the page made.
Clicking an entry in either jumps the replay to that moment.

What is recorded, and what isn't:

- **It records the page, not the screen.** What you see is rebuilt from the page's structure, your
  clicks, scrolls and typing. Nothing outside the browser tab is captured.
- **Password fields are masked**, and any element marked `data-private` is left out. Other fields
  are recorded as typed, so don't type what you wouldn't show the developers.
- **Requests are noted by name, status, duration and size**, never by what they sent or got back.

<TryIt as="planner" />

<HowItWorks />

<Diagram viewBox="0 0 440 150" label="The recorder in the browser sends a report to the server, which stores the recording and mails the developers, who replay it.">
	<g font-size="12" text-anchor="middle">
		<rect x="4" y="40" width="110" height="60" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="59" y="66" fill="var(--foreground)">Recorder</text>
		<text x="59" y="84" fill="var(--muted-foreground)">rrweb, gzipped</text>
		<rect x="152" y="40" width="136" height="60" rx="8" fill="none" stroke="var(--primary)" stroke-width="1.5" />
		<text x="220" y="66" fill="var(--foreground)">POST /bug-reports</text>
		<text x="220" y="84" fill="var(--muted-foreground)">store, row, mail</text>
		<rect x="326" y="40" width="110" height="60" rx="8" fill="none" stroke="var(--border)" stroke-width="1.5" />
		<text x="381" y="66" fill="var(--foreground)">Replay page</text>
		<text x="381" y="84" fill="var(--muted-foreground)">developers only</text>
		<path d="M 116 70 H 150 M 290 70 H 324" stroke="var(--muted-foreground)" stroke-width="1.5" fill="none" />
		<path d="M 145 65 l 6 5 l -6 5 M 319 65 l 6 5 l -6 5" stroke="var(--muted-foreground)" stroke-width="1.5" fill="none" />
	</g>
</Diagram>

- **Recording.** The recorder loads rrweb on the first recording (it is not in the app's bundle) with
  its console plugin for errors and warnings, and wraps `fetch` to note the page's remote function
  calls. One recorder per tab, outside any component, so a recording carries on across client-side
  navigations, from the office to the engineer portal too. Its phases (`idle`, `recording`,
  `stopping`, `sending`) and the steps between them are a small state machine. See <SourceLink path="src/lib/bug-reports/recorder.svelte.ts" line={71} symbol="record">the rrweb options</SourceLink>
  and <SourceLink path="src/lib/bug-reports/machine.ts" line={11} symbol="Phase">the phases</SourceLink>.
- **Limits.** `maxRecordingMs` is ten minutes, `maxReportBytes` 20 MB gzipped. The server refuses a
  request without a `Content-Length` (411) and one over the limit (413) before it reads a byte.
- **The endpoint** is `POST /bug-reports`, a plain endpoint rather than a remote form because the
  recorder sends from script and the endpoint can check the length first. It allows an office
  member or a field engineer, not a customer's contact, and stores the report under the reporter's
  own tenant and user whatever the body says. See <SourceLink path="src/lib/server/bug-reports/upload.ts" line={64}>receiveBugReport</SourceLink>.
- **Storage.** The recording goes first, then the `bug_report` row, then the mail, outside any
  transaction. On Cloudflare the recordings are in an R2 bucket (`BUG_REPORTS`); elsewhere in a
  folder. Both sit behind one small `BugReportStore`.
- **Who may replay.** The pages are at `/ops/bug-reports` and use the `forDevelopers` gate: only
  signed-in users whose email is in `DEVELOPER_EMAILS`, in any organization, and a 404 for everyone
  else, so the pages don't say they exist. See [the gates](/wiki/internals/gates).

<DocsPointer doc="docs/plans/bug-recorder.md" />
