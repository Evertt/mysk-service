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
	import { toast } from "svelte-sonner";

	import { errorMessage } from "#lib/utils.ts";

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

	<AlertDialog.Root bind:open={deleting}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{m.customers_site_delete_title({ name: site.name })}</AlertDialog.Title>
				<AlertDialog.Description>{m.customers_site_delete_description()}</AlertDialog.Description>
			</AlertDialog.Header>
			<form
				{...remove.enhance(async ({ submit }) => {
					try {
						if (!(await submit())) return;
						deleting = false;
						toast.success(m.customers_site_deleted());
					} catch (error) {
						toast.error(errorMessage(error, m.common_error_generic()));
					}
				})}
			>
				<input {...remove.fields.id.as("hidden", String(site.id))} />
				<!-- E.g. while equipment is at the site. -->
				<Field.FieldError errors={remove.fields.allIssues()} class="mb-4" />
				<AlertDialog.Footer>
					<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
					<Button type="submit" variant="destructive" disabled={!!remove.pending}>
						{m.common_delete()}
					</Button>
				</AlertDialog.Footer>
			</form>
		</AlertDialog.Content>
	</AlertDialog.Root>
</li>
