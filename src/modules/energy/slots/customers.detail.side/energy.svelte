<!--
	@component
	The energy module's card on a customer's page (`customers.detail.side`): the customer's sites
	whose energy is monitored, linking to each one's page (and, for managers, its setup), and for
	managers the sites without it, to set it up. Nothing for a customer without energy sites, unless
	a manager may add one.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { canManage } from "#lib/auth/can-manage.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import NewSiteDialog from "../../setup/new-site-dialog.svelte";
	import { getCustomerEnergy } from "../../sites.remote.ts";

	let { code }: { code: string } = $props();

	const data = $derived(await getCustomerEnergy(code));
	const manager = $derived(await canManage());
	const monitored = $derived(data.sites.filter((site) => site.energy));
	const unmonitored = $derived(data.sites.filter((site) => !site.energy));
	const sitePage = (id: number) => resolve("/(app)/(modules)/energy/[site]", { site: String(id) });
</script>

{#if monitored.length || (manager && unmonitored.length)}
	<Card.Root data-energy-card>
		<Card.Header>
			<Card.Title>{m.energy_card_title()}</Card.Title>
			<Card.Description>{m.energy_card_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3 text-sm">
			{#each monitored as site (site.id)}
				{#if site.energy}
					<div class="flex items-center justify-between gap-2" data-energy-card-site={site.id}>
						<span class="flex min-w-0 flex-col">
							<a
								class="truncate font-medium underline-offset-4 hover:underline"
								href={sitePage(site.energy.id)}>{site.energy.name}</a
							>
							<span class="text-xs text-muted-foreground">
								{site.name} · {m.energy_site_counts({
									zones: formatNumber(site.energy.zones),
									doors: formatNumber(site.energy.doors),
								})}
							</span>
						</span>
						{#if manager}
							<Button
								variant="ghost"
								size="icon-sm"
								href={resolve("/(app)/(modules)/energy/[site]/setup", {
									site: String(site.energy.id),
								})}
								aria-label={m.energy_setup_open({ name: site.energy.name })}
							>
								<SettingsIcon />
							</Button>
						{/if}
					</div>
				{/if}
			{/each}
			{#if manager}
				{#each unmonitored as site (site.id)}
					<div class="flex items-center justify-between gap-2" data-energy-card-site={site.id}>
						<span class="flex min-w-0 flex-col">
							<span class="truncate">{site.name}</span>
							<span class="text-xs text-muted-foreground">{m.energy_card_not_monitored()}</span>
						</span>
						<NewSiteDialog
							site={{ id: site.id, name: site.name, customer: data.customer.name }}
							label={m.energy_card_set_up()}
						/>
					</div>
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
