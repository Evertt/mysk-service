<!--
	@component
	The units of an order's work record (`readWorkRecord()`), in the order they're worked on, as
	every shell shows them: each a `UnitRow` with its category, site and location, numbered when
	there are several. `href` links each to its page in the shell; the office gives its own `title`
	(`EquipmentLink`) and lines below (`children`, the warranty). The site is named only when the
	units are at more than one, unless `showSite` says otherwise.
-->
<script lang="ts" generics="U extends WorkRecord<Audience>['units'][number]">
	import type { Snippet } from "svelte";

	import { UnitRow } from "#lib/equipment/components.ts";

	import type { Audience, WorkRecord } from "../server/work-record.ts";

	let {
		units,
		href,
		showSite,
		title,
		children,
	}: {
		units: U[];
		/** Each unit's page in this shell. */
		href?: (unit: U) => string;
		/** Whether each line names its unit's site; by default, when they're at more than one. */
		showSite?: boolean;
		/** A unit's title instead of the plain one, e.g. the office's `EquipmentLink`. */
		title?: Snippet<[U]>;
		/** Lines below a unit, e.g. its warranty. */
		children?: Snippet<[U]>;
	} = $props();

	const sited = $derived(showSite ?? new Set(units.map((unit) => unit.site.id)).size > 1);
</script>

<ol class="flex flex-col divide-y" aria-label={m.orders_units()}>
	{#each units as unit, index (unit.id)}
		{#snippet ownTitle()}
			{@render title?.(unit)}
		{/snippet}
		{#snippet below()}
			{@render children?.(unit)}
		{/snippet}
		<li>
			<UnitRow
				{unit}
				href={href?.(unit)}
				number={units.length > 1 ? index + 1 : undefined}
				extras={{
					category: unit.category,
					site: sited ? unit.site.name : null,
					location: unit.location,
				}}
				title={title && ownTitle}
				children={children && below}
			/>
		</li>
	{/each}
</ol>
