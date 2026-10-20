<!--
	@component
	A document to print on A4, such as a work order: on screen a sheet of A4's width, on paper the
	page itself, with A4's margins. The shells keep their navigation and notices off the paper.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { cn } from "#lib/utils.ts";

	let {
		class: className,
		children,
		...rest
	}: { class?: string; children: Snippet } & Omit<
		HTMLAttributes<HTMLDivElement>,
		"class"
	> = $props();
</script>

<div
	class={cn(
		"mx-auto w-full max-w-[210mm] rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0",
		className,
	)}
	data-print-sheet
	{...rest}
>
	{@render children()}
</div>

<style>
	@media print {
		@page {
			size: A4;
			margin: 14mm;
		}
	}
</style>
