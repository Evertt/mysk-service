<!--
	@component
	A made-up module's card in the `orders.detail.side` slot, for `extension-slot.svelte.spec.ts`: it awaits its
	data like a real one awaits its remote query.
-->
<script lang="ts">
	let { number }: { number: string } = $props();

	const text = $derived(await Promise.resolve(`Gadgets for ${number}`));
</script>

<Card.Root>
	<Card.Content>{text}</Card.Content>
</Card.Root>
