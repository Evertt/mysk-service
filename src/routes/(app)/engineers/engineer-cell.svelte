<!--
	@component
	An engineer's name, linking to their page, with their email address below.
-->
<script lang="ts">
	import EngineerLink from "#lib/components/engineers/engineer-link.svelte";

	let { id, name, email }: { id: number; name: string; email: string } = $props();
</script>

<div class="flex max-w-64 flex-col">
	<span class="truncate"><EngineerLink {id} {name} /></span>
	<span class="truncate text-xs text-muted-foreground">{email}</span>
</div>
