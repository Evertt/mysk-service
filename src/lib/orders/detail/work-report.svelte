<!--
	@component
	What the engineer recorded on an order in the field: the sign-off (the customer's signature and,
	since engineers sign too, the engineer's, with who in the office collected it) and work notes.
	Nothing while there's neither.
-->
<script lang="ts">
	import type { getOrder } from "../order.remote.ts";
	import NotesList from "../ui/notes-list.svelte";
	import SignOff from "../ui/sign-off.svelte";

	type Order = Awaited<ReturnType<typeof getOrder>>;

	let { notes, signoff }: Pick<Order, "notes" | "signoff"> = $props();
</script>

{#if signoff || notes.length}
	<Card.Root data-slot="work-report">
		<Card.Header>
			<Card.Title>{m.orders_report_title()}</Card.Title>
			<Card.Description>{m.orders_report_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if signoff}
				<SignOff {signoff} />
			{/if}
			{#if notes.length}
				<NotesList {notes} />
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
