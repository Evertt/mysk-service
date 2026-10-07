<script lang="ts">
	import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
	import { label } from "#lib/i18n/labels.js";
	import type { EquipmentStatus } from "#lib/models.js";

	let { status }: { status: EquipmentStatus } = $props();

	const variants: Record<EquipmentStatus, BadgeVariant> = {
		operational: "secondary",
		needs_service: "outline",
		out_of_service: "destructive",
		decommissioned: "ghost",
	};
</script>

<Badge variant={variants[status]}>{label("equipmentStatus", status)}</Badge>
