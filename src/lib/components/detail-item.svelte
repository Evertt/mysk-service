<!--
	@component
	A label and value in a detail view's `<dl>`; shows "—" without a value, and a link with `href`.
	Pass `children` to render the value yourself (e.g. a badge).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		label,
		value,
		href,
		children,
	}: { label: string; value?: string | null; href?: string; children?: Snippet } = $props();
</script>

<div class="flex flex-col gap-0.5">
	<dt class="text-xs text-muted-foreground">{label}</dt>
	<dd class="text-sm wrap-break-word">
		{#if children}
			{@render children()}
		{:else if value && href}
			<a {href} class="underline-offset-4 hover:underline">{value}</a>
		{:else}
			{value || "—"}
		{/if}
	</dd>
</div>
