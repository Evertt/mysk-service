<!--
	@component
	A unit's status as a badge, coloured by what it means. A planned unit whose state asks for more
	(critical or attention) gets a small mark in that colour beside it: the work is in hand, but this
	is what it's for.
-->
<script lang="ts">
	import { statusTones } from "../display.ts";
	import { conditionLabels } from "../labels.ts";
	import type { Concern, UnitStatus } from "../model.ts";

	let { status, concern }: { status: UnitStatus; concern?: Concern } = $props();

	const marked = $derived(status === "planned" && concern && concern !== "ok" ? concern : null);
</script>

<span class="inline-flex items-center gap-1.5" data-status={status}>
	<Badge variant={statusTones[status]}>{conditionLabels.label("unitStatus", status)}</Badge>
	{#if marked}
		{@const text = m.condition_underlying({
			status: conditionLabels.label("unitStatus", marked),
		})}
		<span
			class={[
				"size-2 shrink-0 rounded-full",
				marked === "critical" ? "bg-destructive" : "bg-amber-500",
			]}
			title={text}
			data-concern={marked}
		></span>
		<span class="sr-only">{text}</span>
	{/if}
</span>
