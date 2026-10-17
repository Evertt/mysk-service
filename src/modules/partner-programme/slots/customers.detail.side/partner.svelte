<!--
	@component
	The partner programme's card on a customer's page (`customers.detail.side`): a partner's level,
	figures and wallet; for a customer that isn't one, a manager's way to accept it, and nothing
	for other members.
-->
<script lang="ts">
	import AcceptCard from "../../detail/accept-card.svelte";
	import PartnerCard from "../../detail/partner-card.svelte";
	import { getPartnerCard } from "../../partners.remote.ts";

	let { code }: { code: string } = $props();

	const card = $derived(await getPartnerCard(code));
</script>

{#if card.partner !== null}
	<PartnerCard {card} />
{:else if card.canManage}
	<AcceptCard customer={card.customer} />
{/if}
