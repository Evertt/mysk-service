<script>
	import Loader from "./Loader.svelte";

	let { items } = $props();
	const list = $derived(await Promise.resolve(items));
</script>

<h1>before</h1>
{#if list.length}
	<div>
		{#each list as id (id)}
			<svelte:boundary onerror={(e) => console.log("onerror", id, JSON.stringify(e))}>
				<Loader {id} />
				{#snippet failed(e, reset)}
					<p class="failed">failed {id} <button onclick={reset}>retry</button></p>
				{/snippet}
			</svelte:boundary>
		{/each}
	</div>
{/if}
<p id="after">after</p>
