<!--
	@component
	A unit's condition status in the equipment list, with what's behind a planned one.
-->
<script lang="ts">
	import type { StatusValue } from "../columns/equipment.list.ts";
	import StatusBadge from "./status-badge.svelte";

	let { value }: { value: StatusValue } = $props();
</script>

<StatusBadge status={value.status} concern={value.concern} />
