<script>
	let { id } = $props();
	const text = $derived(
		await(id === "bad" ? Promise.reject(new Error("boom")) : Promise.resolve(`child ${id}`)),
	);
</script>

<span>{text}</span>
