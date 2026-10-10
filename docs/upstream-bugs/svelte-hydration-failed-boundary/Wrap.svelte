<script>
	import Loader from "./Loader.svelte";

	let { items } = $props();
</script>

{#each items as id (id)}
	<svelte:boundary onerror={(e) => console.log("onerror", id, JSON.stringify(e))}>
		<Loader {id} />
		{#snippet failed(e, reset)}
			<p class="failed">failed {id} <button onclick={reset}>retry</button></p>
		{/snippet}
	</svelte:boundary>
{/each}
