<script lang="ts">
	import type { EngineerSpecialty } from "#lib/models.js";

	import { specialties } from "./display.js";

	let { specialty }: { specialty: EngineerSpecialty } = $props();

	const display = $derived(specialties[specialty]);
</script>

<Badge variant="outline">
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
