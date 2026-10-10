<script>
	import Child from "./Child.svelte";

	const show = $derived(await Promise.resolve(true));
</script>

<h1>before</h1>
{#if show}
	<svelte:boundary onerror={(e) => console.log("onerror", JSON.stringify(e))}>
		<Child id="bad" />
		{#snippet failed(e, reset)}
			<p class="failed">failed <button onclick={reset}>retry</button></p>
		{/snippet}
	</svelte:boundary>
{/if}
<p id="after">after</p>
