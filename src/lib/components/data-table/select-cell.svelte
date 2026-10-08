<script lang="ts">
	import { useCellContext } from "./table.svelte.ts";

	const cell = useCellContext();
	const row = $derived(cell.row);
</script>

<Checkbox
	checked={row.getIsSelected()}
	disabled={!row.getCanSelect()}
	onCheckedChange={(value) => row.toggleSelected(value)}
	aria-label={m.common_table_select_row()}
/>
