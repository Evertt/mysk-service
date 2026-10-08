<!--
	@component
	A number with its label above and, optionally, a line of detail below: the tiles on the dashboard
	and the detail pages. Format the value before passing it (`formatNumber`, `formatCents`, …).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		label,
		value,
		detail,
		size = "large",
		action,
	}: {
		label: string;
		value: string;
		detail?: string;
		/** `large` for a row of tiles on their own, `small` for tiles inside a column. */
		size?: "large" | "small";
		/** Rendered at the top right, e.g. a link to the records behind the number. */
		action?: Snippet;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Description>{label}</Card.Description>
		<Card.Title class="{size === 'large' ? 'text-3xl' : 'text-2xl'} tabular-nums"
			>{value}</Card.Title
		>
		{#if action}
			<Card.Action>{@render action()}</Card.Action>
		{/if}
	</Card.Header>
	{#if detail}
		<Card.Footer class="text-sm text-muted-foreground">{detail}</Card.Footer>
	{/if}
</Card.Root>
