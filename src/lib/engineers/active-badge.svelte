<!--
	@component
	Whether an engineer is active (can be assigned new orders) or inactive.
-->
<script lang="ts">
	let { active }: { active: boolean } = $props();
</script>

<Badge variant={active ? "secondary" : "ghost"}
	>{active ? m.engineers_active() : m.engineers_inactive()}</Badge
>
