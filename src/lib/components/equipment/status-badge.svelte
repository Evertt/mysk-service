<script lang="ts">
	import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
	import { humanize } from "#lib/format.js";
	import type { EquipmentStatus } from "#lib/models.js";

	let { status }: { status: EquipmentStatus } = $props();

	const variants: Record<EquipmentStatus, BadgeVariant> = {
		operational: "secondary",
		needs_service: "outline",
		out_of_service: "destructive",
		decommissioned: "ghost",
	};
</script>

<Badge variant={variants[status]}>{humanize(status)}</Badge>
