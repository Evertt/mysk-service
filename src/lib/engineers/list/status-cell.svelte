<!--
	@component
	Whether an engineer is active, in the engineers table: a select that looks like its badge (see
	`BadgeSelect`), which marks them active or inactive as the bulk actions do. Its arrow opens the
	choice; clicking the rest of the badge filters the table by the status. A change shows at
	once; if it fails, a toast says why and the badge goes back.
-->
<script lang="ts">
	import BadgeSelect, { type BadgeOption } from "#lib/components/badge-select.svelte";
	import { cellFilter } from "#lib/components/data-table/cell-filter.svelte.ts";
	import { ran } from "#lib/components/form/submitted.ts";

	import { getEngineers, setEngineerActive } from "../engineers.remote.ts";

	let {
		id,
		name,
		active,
		fixed = false,
	}: {
		id: number;
		name: string;
		active: boolean;
		/** Shows the status as a plain badge. */
		fixed?: boolean;
	} = $props();

	type Status = "active" | "inactive";

	// As `ActiveBadge` shows them.
	const option = (value: Status): BadgeOption<Status> =>
		value === "active"
			? { value, label: m.engineers_active(), variant: "secondary" }
			: { value, label: m.engineers_inactive(), variant: "ghost" };

	const status = $derived<Status>(active ? "active" : "inactive");
	// Clicking the badge filters the table by the status; its arrow changes it.
	const filter = cellFilter(() => ({ value: status, label: option(status).label }));

	function change(to: Status) {
		const value = to === "active";
		return ran(
			setEngineerActive({ id, active: value }).updates(
				getEngineers().withOverride((current) =>
					current.map((row) => (row.id === id ? { ...row, active: value } : row)),
				),
			),
			m.engineers_status_change_failed({ name }),
		);
	}
</script>

<BadgeSelect
	current={option(status)}
	options={fixed ? [] : [option("active"), option("inactive")]}
	label={m.engineers_status_of({ name })}
	onchange={change}
	filter={fixed ? undefined : filter}
/>
