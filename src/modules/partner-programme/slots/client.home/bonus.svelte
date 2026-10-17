<!--
	@component
	The partner programme's cards on the customer portal's home page (`client.home`): the partner's
	bonus so far this year, with the way to its page ("Bekijk programma en voorwaarden") and a word
	when a closed year's bonus waits for its choice, and its wallet: side by side where there's room
	(a desk's screen), one under the other on a phone. Nothing for a customer that isn't a partner.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import HourglassIcon from "@lucide/svelte/icons/hourglass";

	import Callout from "#lib/components/callout.svelte";

	import { getClientPartner } from "../../client/client-partner.remote.ts";
	import ClientStatus from "../../client/client-status.svelte";
	import ClientWallet from "../../client/client-wallet.svelte";

	const data = $derived(await getClientPartner());
</script>

{#if data.partner}
	<div class="@container">
		<div class="grid items-start gap-6 @3xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
			<Card.Root data-client-home-bonus>
				<Card.Header>
					<Card.Title>{m.partners_card_title({ year: String(data.year) })}</Card.Title>
					<Card.Description>{m.partners_client_bonus_description()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					{#if data.awaiting}
						<Callout icon={HourglassIcon} data-client-awaiting-choice>
							{m.partners_client_choice_waiting({ year: String(data.awaiting.year) })}
						</Callout>
					{/if}
					<ClientStatus figures={data.figures} year={data.year} />
					<Button
						variant="outline"
						class="self-start"
						href={resolve("/(customer)/(modules)/partner-programme/portal")}
					>
						{m.partners_client_view_programme()}
						<ArrowRightIcon data-icon="inline-end" />
					</Button>
				</Card.Content>
			</Card.Root>
			<ClientWallet wallet={data.wallet} />
		</div>
	</div>
{/if}
