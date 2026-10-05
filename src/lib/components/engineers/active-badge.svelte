<!--
	@component
	Whether an engineer is active (can be assigned new orders) or inactive.
-->
<script lang="ts">
	let { active }: { active: boolean } = $props();
</script>

<Badge variant={active ? "secondary" : "ghost"}>{active ? "Active" : "Inactive"}</Badge>
