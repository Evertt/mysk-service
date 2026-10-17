<!--
	@component
	The partner programme's cards on the customer portal's home page (`client.home`): the partner's
	bonus so far this year, with the way to its page ("Bekijk programma en voorwaarden") and a word
	when a closed year's bonus waits for its choice, and its wallet. Nothing for a customer that
	isn't a partner.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { getClientPartner } from "../../client/client-partner.remote.ts";
	import ClientStatus from "../../client/client-status.svelte";
	import ClientWallet from "../../client/client-wallet.svelte";

	const data = $derived(await getClientPartner());
</script>

{#if data.partner}
	<Card.Root data-client-home-bonus>
		<Card.Header>
			<Card.Title>{m.partners_card_title({ year: String(data.year) })}</Card.Title>
			<Card.Description>{m.partners_client_bonus_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if data.awaiting}
				<p
					class="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
					data-client-awaiting-choice
				>
					{m.partners_client_choice_waiting({ year: String(data.awaiting.year) })}
				</p>
			{/if}
			<ClientStatus figures={data.figures} year={data.year} />
			<Button variant="outline" href={resolve("/(customer)/(modules)/partner-programme/portal")}>
				{m.partners_client_view_programme()}
			</Button>
		</Card.Content>
	</Card.Root>
	<ClientWallet wallet={data.wallet} />
{/if}
