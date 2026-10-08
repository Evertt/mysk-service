<script lang="ts">
	import type { EngineerSpecialty } from "#lib/models.ts";

	import { specialties } from "./display.ts";

	let { specialty }: { specialty: EngineerSpecialty } = $props();

	const display = $derived(specialties[specialty]);
</script>

<Badge variant="outline">
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
