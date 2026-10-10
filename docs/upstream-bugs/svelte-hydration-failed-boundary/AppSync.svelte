<script>
	import Thrower from "./Thrower.svelte";
</script>

<h1>before</h1>
<svelte:boundary onerror={(e) => console.log("onerror", JSON.stringify(e))}>
	<Thrower />
	{#snippet failed(e, reset)}
		<p class="failed">failed <button onclick={reset}>retry</button></p>
	{/snippet}
</svelte:boundary>
<p id="after">after</p>
