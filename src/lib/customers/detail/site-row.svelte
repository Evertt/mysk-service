<!--
	@component
	One of a customer's sites on their sites card: its name, how many units are there and what to
	know before a visit, with a menu to edit and delete it.
-->
<script lang="ts">
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import type { ComponentProps, Snippet } from "svelte";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";

	import SiteDialog from "../form/site-dialog.svelte";
	import SiteDetails from "../ui/site-details.svelte";
	import { deleteCustomerSite } from "./sites.remote.ts";

	type Site = NonNullable<ComponentProps<typeof SiteDialog>["site"]>;

	let {
		site,
		customer,
		countries,
		extra,
	}: {
		site: Site & { equipmentCount: number };
		customer: { id: number; city: string; country: string };
		countries: string[];
		/** Shown under the site's details, e.g. its locations. */
		extra?: Snippet<[{ id: number; name: string }]>;
	} = $props();

	let editing = $state(false);
	let deleting = $state(false);
	const remove = $derived(deleteCustomerSite.for(String(site.id)));
</script>

<li class="flex flex-col gap-4 py-4 first:pt-0 last:pb-0" data-site={site.id}>
	<div class="flex items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-medium">{site.name}</span>
				{#if site.priority === "high"}
					<Badge variant="destructive">{m.customers_site_high_priority()}</Badge>
				{/if}
			</div>
			<span class="text-sm text-muted-foreground">
				{m.customers_count_units({ count: site.equipmentCount })}
			</span>
		</div>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						aria-label={m.customers_site_actions({ name: site.name })}
					>
						<EllipsisIcon />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-40">
				<DropdownMenu.Item onclick={() => (editing = true)}>
					<PencilIcon />{m.common_edit()}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onclick={() => (deleting = true)}>
					<Trash2Icon />{m.common_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
	<SiteDetails {site} />
	{@render extra?.(site)}

	<SiteDialog {customer} {site} {countries} bind:open={editing} />

	<!-- Refused while equipment is at the site. -->
	<ConfirmDialog
		form={remove}
		hidden={{ id: String(site.id) }}
		title={m.customers_site_delete_title({ name: site.name })}
		description={m.customers_site_delete_description()}
		confirmLabel={m.common_delete()}
		destructive
		done={m.customers_site_deleted()}
		bind:open={deleting}
	/>
</li>
