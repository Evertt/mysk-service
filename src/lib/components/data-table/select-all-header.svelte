<script lang="ts">
	import { useTableContext } from "./table.svelte.js";

	const table = useTableContext();
</script>

<Checkbox
	checked={table.getIsAllPageRowsSelected()}
	indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
	onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
	aria-label={m.common_table_select_all()}
/>
