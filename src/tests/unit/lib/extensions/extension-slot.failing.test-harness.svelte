<!--
	@component
	A made-up module's card in the `orders.detail.side` slot that fails, for
	`extension-slot.svelte.spec.ts`: it awaits its data like a real one awaits its remote query,
	which throws while `data.fails` is set.
-->
<script lang="ts" module>
	export const data = { fails: true };
</script>

<script lang="ts">
	let { number }: { number: string } = $props();

	const query = (): Promise<string> =>
		data.fails
			? Promise.reject(new Error("The query failed"))
			: Promise.resolve(`Widgets for ${number}`);

	const text = $derived(await query());
</script>

<Card.Root>
	<Card.Content>{text}</Card.Content>
</Card.Root>
