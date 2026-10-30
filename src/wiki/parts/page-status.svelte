<!--
	@component
	The notice above a page that isn't built (all the way): `partly built` says part of it is still
	to come, `planned` that none of it exists yet. A built page has none.
-->
<script lang="ts">
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import HammerIcon from "@lucide/svelte/icons/hammer";

	import Callout from "#lib/components/callout.svelte";
	import type { PageMeta } from "#wiki/pages.ts";

	let { status }: { status: PageMeta["status"] } = $props();
</script>

{#if status === "partly built"}
	<Callout tone="warning" icon={HammerIcon} class="not-prose mb-6">
		This is partly built: some of what this page describes isn't in the app yet.
	</Callout>
{:else if status === "planned"}
	<Callout tone="brand" icon={CalendarClockIcon} class="not-prose mb-6">
		This is planned: what this page describes isn't in the app yet.
	</Callout>
{/if}
