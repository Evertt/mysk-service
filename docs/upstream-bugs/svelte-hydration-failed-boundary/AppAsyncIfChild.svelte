<script>
	import Wrap from "./Wrap.svelte";

	const items = $derived(await Promise.resolve(["ok", "bad", "ok2"]));
</script>

<h1>before</h1>
{#if items.length}
	<div><Wrap {items} /></div>
{/if}
<p id="after">after</p>
