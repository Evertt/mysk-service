<!--
	@component
	The equipment list's categories as chips ("SOORT" in the SHLTR mockup): all, then each category
	with the units it has under the search and the other filters, one chosen at a time. They set the
	table's category filter (in the URL), as its Category filter does; several chosen there press no
	chip. Inside the table (`table.AppTable`).
-->
<script lang="ts">
	import { useTableContext } from "#lib/components/data-table/table.svelte.ts";
	import FilterChips from "#lib/components/filter-chips.svelte";

	let {
		categories,
		counts,
	}: {
		/** The tenant's categories, in their order. */
		categories: { id: number; name: string }[];
		/** How many units each category has (by id), the category filter left out. */
		counts: Readonly<Record<string, number>>;
	} = $props();

	const table = useTableContext();
	const column = $derived(table.getColumn("category"));
	const chosen = $derived((column?.getFilterValue() as string[] | undefined) ?? []);
	// One chosen: its chip; none: "all"; several (in the filter menu): none of the chips.
	const value = $derived(chosen.length === 0 ? null : chosen.length === 1 ? chosen[0] : "");
	const total = $derived(Object.values(counts).reduce((sum, count) => sum + count, 0));
	const options = $derived(
		categories
			.map((category) => ({
				value: String(category.id),
				label: category.name,
				count: counts[String(category.id)] ?? 0,
			}))
			.filter((option) => option.count > 0 || chosen.includes(option.value)),
	);
</script>

<FilterChips
	label={m.equipment_column_category()}
	showLabel
	{options}
	{value}
	all={{ label: m.equipment_categories_all(), count: total }}
	onchange={(next) => column?.setFilterValue(next === null ? undefined : [next])}
/>
