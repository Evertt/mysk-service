<script>
	import Child from "./Child.svelte";
</script>

<h1>before</h1>
<svelte:boundary onerror={(e) => console.log("onerror", JSON.stringify(e))}>
	<Child id="bad" />
	{#snippet failed(e, reset)}
		<p class="failed">failed <button onclick={reset}>retry</button></p>
	{/snippet}
</svelte:boundary>
<p id="after">after</p>
