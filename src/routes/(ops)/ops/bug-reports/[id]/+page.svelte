<script lang="ts">
	import { browser } from "$app/env";
	import { resolve } from "$app/paths";

	import { contextLines } from "#lib/bug-reports/context-lines.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDateTime, formatStopwatch } from "#lib/i18n/format.ts";

	import { getBugReport } from "../bug-reports.remote.ts";
	import type { PageProps } from "./$types";
	import { loadRecording } from "./recording.ts";
	import Replay from "./replay.svelte";

	let { params }: PageProps = $props();

	const report = $derived(await getBugReport(params.id));
	// In the browser only: it's megabytes, and the player runs there.
	const recording = $derived(browser ? loadRecording(report.id) : undefined);
	const lines = $derived([
		[m.bugs_context_started(), formatDateTime(report.startedAt)],
		[m.bugs_context_duration(), formatStopwatch(report.durationMs)],
		...contextLines(report.userName, report.context),
	]);
</script>

<svelte:head>
	<title>{m.bugs_replay_title({ user: report.userName })}</title>
</svelte:head>

<PageHeader
	title={m.bugs_replay_title({ user: report.userName })}
	description={report.context.organization.name}
	breadcrumbs={[
		{ label: m.bugs_back(), href: resolve("/(ops)/ops/bug-reports") },
		{ label: formatDateTime(report.createdAt) },
	]}
/>

{#if report.note}
	<blockquote class="border-l-4 pl-4 whitespace-pre-line" data-slot="bug-report-note">
		{report.note}
	</blockquote>
{/if}

{#if recording}
	{#await recording}
		<p class="text-sm text-muted-foreground">{m.bugs_replay_loading()}</p>
	{:then events}
		<Replay {events} context={report.context} />
	{:catch}
		<p class="text-sm text-destructive">{m.bugs_replay_failed()}</p>
	{/await}
{/if}

<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
	{#each lines as [label, value] (label)}
		<dt class="text-muted-foreground">{label}</dt>
		<dd class="break-words">{value}</dd>
	{/each}
</dl>
