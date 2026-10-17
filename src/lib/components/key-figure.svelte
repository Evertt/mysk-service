<!--
	@component
	A key figure on a tinted block with a bar in the brand's colour on its left, as the SHLTR mockup
	shows a partner's level and revenue. A `<dt>` and `<dd>`: put it in a `<dl>` (a grid of them).
	The value is `children`, formatted, so a caller can mark it (`data-…`) for tests.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import { cn } from "#lib/utils.ts";

	let {
		label,
		children,
		class: className,
	}: {
		label: string;
		/** The value, e.g. `<span data-partner-revenue>€200,000</span>`. */
		children: Snippet;
		class?: string;
	} = $props();
</script>

<div
	class={cn("min-w-0 border-l-2 border-primary bg-muted/70 px-4 py-3", className)}
	data-key-figure
>
	<dt class="text-xs text-muted-foreground">{label}</dt>
	<dd class="mt-1 font-semibold tabular-nums">{@render children()}</dd>
</div>
