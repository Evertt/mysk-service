<script lang="ts">
	import type { EquipmentStatus } from "#lib/models.ts";

	import { statuses } from "./display.ts";

	let { status }: { status: EquipmentStatus } = $props();

	const display = $derived(statuses[status]);
</script>

<Badge variant={display.variant}>{display.label}</Badge>
