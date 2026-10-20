<!--
	@component
	An enum value as a badge: its icon and label, in its tone, from its kind's display map
	(`withLabels(kind, { [value]: BadgeDisplay })`), e.g.
	`<EnumBadge display={orderStatusDisplay} value={order.status} />`. The one way to show an enum
	value as a badge: other attributes (`class`, `data-*`) go on the badge.
-->
<script lang="ts" generics="V extends string">
	import type { ClassValue } from "svelte/elements";

	import type { BadgeDisplay } from "#lib/i18n/labels.ts";

	let {
		display,
		value,
		...rest
	}: {
		/** Each value's label, icon and tone. */
		display: Readonly<Record<V, BadgeDisplay & { readonly label: string }>>;
		value: V;
		class?: ClassValue;
		title?: string;
		[data: `data-${string}`]: unknown;
	} = $props();

	const shown = $derived(display[value]);
</script>

<Badge variant={shown.tone} {...rest}>
	{#if shown.icon}
		<shown.icon data-icon="inline-start" />
	{/if}
	{shown.label}
</Badge>
