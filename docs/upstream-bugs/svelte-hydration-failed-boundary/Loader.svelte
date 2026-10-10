<script>
	import Child from "./Child.svelte";

	let { id } = $props();
	const C = $derived((await Promise.resolve({ default: Child })).default);
</script>

<C {id} />
