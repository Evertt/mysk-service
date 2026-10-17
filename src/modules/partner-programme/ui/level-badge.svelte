<!--
	@component
	A partner's level, e.g. PLATINUM, as a badge; "No level" below the first.
-->
<script lang="ts">
	let { level }: { level: string | null } = $props();
</script>

{#if level}
	<Badge variant="info" data-level>{level}</Badge>
{:else}
	<Badge variant="neutral" data-level>{m.partners_no_level()}</Badge>
{/if}
