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
		"mx-auto w-full max-w-[210mm] rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0 print:[page:sheet]",
		className,
	)}
	data-print-sheet
	{...rest}
>
	{@render children()}
</div>

<style>
	/* A named page (`page: sheet` above), so these margins apply to the sheet only: a component's CSS
	   stays loaded once its chunk is, and an unnamed @page would apply to whatever is printed after. */
	@media print {
		@page sheet {
			size: A4;
			margin: 14mm;
		}
	}
</style>
