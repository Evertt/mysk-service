<!--
	@component
	Whether an engineer is active, in the engineers table: a select that looks like its badge (see
	`BadgeSelect`), which marks them active or inactive as the bulk actions do. A change shows at
	once; if it fails, a toast says why and the badge goes back.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import BadgeSelect, { type BadgeOption } from "#lib/components/badge-select.svelte";
	import { errorMessage } from "#lib/utils.ts";

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

	async function change(to: Status) {
		const value = to === "active";
		try {
			await setEngineerActive({ id, active: value }).updates(
				getEngineers().withOverride((current) =>
					current.map((row) => (row.id === id ? { ...row, active: value } : row)),
				),
			);
		} catch (error) {
			toast.error(errorMessage(error, m.engineers_status_change_failed({ name })));
		}
	}
</script>

<BadgeSelect
	current={option(active ? "active" : "inactive")}
	options={fixed ? [] : [option("active"), option("inactive")]}
	label={m.engineers_status_of({ name })}
	onchange={change}
/>
