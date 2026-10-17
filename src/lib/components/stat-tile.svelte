<!--
	@component
	A key figure as the SHLTR mockup's KPI rows show it: a small label with a coloured icon, and the
	value below in the same colour. `tone` says what the number means (`neutral` for a plain count).
	Format the value before passing it.
-->
<script lang="ts">
	import type { Component } from "svelte";

	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

	let {
		label,
		value,
		icon: Icon,
		tone = "neutral",
	}: {
		label: string;
		value: string;
		/** A Lucide icon, e.g. `LockIcon`. */
		icon?: Component<{ class?: string }>;
		tone?: BadgeTone;
	} = $props();

	const tones: Record<BadgeTone, string> = {
		neutral: "text-foreground",
		success: "text-emerald-600 dark:text-emerald-400",
		warning: "text-amber-600 dark:text-amber-400",
		danger: "text-rose-600 dark:text-rose-400",
		info: "text-sky-600 dark:text-sky-400",
	};
</script>

<div class="rounded-lg border bg-card p-4 text-card-foreground">
	<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
		{#if Icon}
			<Icon class="size-4 shrink-0 {tones[tone]}" />
		{/if}
		{label}
	</div>
	<div class="mt-2 text-2xl font-semibold tabular-nums {tones[tone]}">{value}</div>
</div>
