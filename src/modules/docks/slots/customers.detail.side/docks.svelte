<!--
	@component
	The docks module's card on a customer's page (`customers.detail.side`): the docks at the
	customer's sites with their live state, linking to the board; managers add, edit and delete them
	here. Nothing for a customer without docks, unless a manager may add one.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { canManage } from "#lib/auth/can-manage.ts";
	import EnumBadge from "#lib/components/enum-badge.svelte";

	import { dockStateDisplay } from "../../display.ts";
	import { getCustomerDocks } from "../../docks.remote.ts";
	import DeleteDock from "../../form/delete-dock.svelte";
	import DockDialog from "../../form/dock-dialog.svelte";
	import { dockState } from "../../model.ts";

	let { code }: { code: string } = $props();

	const [data, manager] = $derived(await Promise.all([getCustomerDocks(code), canManage()]));
	const bySite = $derived(
		data.sites
			.map((site) => ({ site, docks: data.docks.filter((dock) => dock.siteId === site.id) }))
			.filter((group) => group.docks.length),
	);
	const boardHref = (siteId: number) => `${resolve("/(app)/(modules)/docks")}?site=${siteId}`;
</script>

{#if data.docks.length || (manager && data.sites.length)}
	<Card.Root data-docks-card>
		<Card.Header>
			<Card.Title>{m.docks_card_title()}</Card.Title>
			<Card.Description>{m.docks_card_description()}</Card.Description>
			{#if manager}
				<Card.Action><DockDialog {data} /></Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#each bySite as group (group.site.id)}
				<section class="flex flex-col gap-2">
					<a
						class="text-sm font-medium underline-offset-4 hover:underline"
						href={boardHref(group.site.id)}
					>
						{group.site.name}
					</a>
					<ul class="flex flex-col divide-y text-sm">
						{#each group.docks as dock (dock.id)}
							<li
								class="flex items-center justify-between gap-2 py-1.5"
								data-customer-dock={dock.code}
							>
								<span class="flex min-w-0 flex-col">
									<span class="font-mono">{dock.code}</span>
									<span class="truncate text-xs text-muted-foreground">{dock.position}</span>
								</span>
								<span class="flex shrink-0 items-center gap-1">
									{#if dock.locked !== null}
										{@const state = dockState(
											{ scpOnline: dock.scpOnline ?? true, locked: dock.locked },
											dock.occupied,
										)}
										<EnumBadge display={dockStateDisplay} value={state} data-dock-state={state} />
									{/if}
									{#if manager}
										<DockDialog {data} {dock} />
										<DeleteDock customer={data.customer.code} {dock} />
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<p class="text-sm text-muted-foreground">{m.docks_card_empty()}</p>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
