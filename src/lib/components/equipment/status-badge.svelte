<script lang="ts">
	import type { EquipmentStatus } from "#lib/models.js";

	import { statuses } from "./display.js";

	let { status }: { status: EquipmentStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>{display.label}</Badge>
