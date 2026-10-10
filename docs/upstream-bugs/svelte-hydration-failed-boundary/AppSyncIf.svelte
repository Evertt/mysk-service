<script>
	import Wrap from "./Wrap.svelte";

	let { items } = $props();
</script>

<h1>before</h1>
{#if items.length}
	<div><Wrap {items} /></div>
{/if}
<p id="after">after</p>
