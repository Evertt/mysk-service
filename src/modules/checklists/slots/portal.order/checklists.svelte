<!--
	@component
	The checklists on an engineer's page of one of their orders (`portal.order`): a card per unit
	that has one, filled in while the job is in progress. The order is completed only once every one
	of them is: once a checklist's status changes, it tells the page (`changed()`), whose refusal to
	complete the order may be outdated by it.
-->
<script lang="ts">
	import { untrack } from "svelte";

	import FieldChecklist from "../../portal/field-checklist.svelte";
	import { getFieldChecklists } from "../../portal/field-checklists.remote.ts";

	let { number, changed }: { number: string; changed: () => void } = $props();

	const data = $derived(await getFieldChecklists(number));

	const statuses = $derived(data.checklists.map((checklist) => checklist.status).join());
	let seen: string | undefined;
	$effect(() => {
		if (seen !== undefined && statuses !== seen) untrack(changed);
		seen = statuses;
	});
</script>

{#if data.checklists.length}
	<section
		class="flex flex-col gap-3"
		aria-label={m.checklists_portal_title()}
		data-field-checklists
	>
		<div class="flex flex-col gap-1">
			<h2 class="text-lg font-semibold tracking-tight">{m.checklists_portal_title()}</h2>
			<p class="text-sm text-muted-foreground">
				{data.canChange ? m.checklists_portal_work() : m.checklists_portal_done()}
			</p>
		</div>
		{#each data.checklists as checklist (checklist.id)}
			<!-- Anew when it's completed, so it shows what's on record. -->
			{#key checklist.status}
				<FieldChecklist {checklist} canChange={data.canChange} />
			{/key}
		{/each}
	</section>
{/if}
