<!--
	@component
	The customer's portal access, on its page: the contacts who sign in to the customer portal for
	them (to report breakdowns and follow their orders and equipment), invited by email for all of
	the customer's sites or some. Owners and admins invite and revoke; the others only see who has
	access.
-->
<script lang="ts">
	import MailIcon from "@lucide/svelte/icons/mail";
	import { toast } from "svelte-sonner";

	import { canManage } from "#lib/auth/can-manage.ts";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { type BadgeDisplay, formatDate, labelled } from "#lib/i18n/index.ts";

	import {
		getPortalAccess,
		invitePortalContact,
		type PortalContactState,
		revokePortalContact,
	} from "./portal-access.remote.ts";

	let { code }: { code: string } = $props();

	const access = $derived(await getPortalAccess(code));
	const manager = $derived(await canManage());
	const form = $derived(invitePortalContact.for(`customer-${access.customer.id}`));

	const stateDisplay = labelled({
		invited: { label: m.customers_portal_state_invited, tone: "info" },
		expired: { label: m.customers_portal_state_expired, tone: "danger" },
		active: { label: m.customers_portal_state_active, tone: "success" },
	} satisfies Record<PortalContactState, BadgeDisplay & { label: () => string }>);
</script>

<Card.Root data-portal-access>
	<Card.Header>
		<Card.Title>{m.customers_portal_title()}</Card.Title>
		<Card.Description>
			{m.customers_portal_description({ name: access.customer.name })}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if access.contacts.length}
			<ul class="flex flex-col divide-y">
				{#each access.contacts as contact (contact.id)}
					<li
						class="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
						data-portal-contact={contact.email}
					>
						<div class="flex min-w-0 flex-col gap-0.5">
							<span class="truncate font-medium">{contact.name ?? contact.email}</span>
							{#if contact.name}
								<span class="truncate text-xs text-muted-foreground">{contact.email}</span>
							{/if}
							<span class="text-xs text-muted-foreground">
								{contact.sites
									? m.customers_portal_some_sites({ sites: contact.sites.join(", ") })
									: m.customers_portal_all_sites()}
								· {m.customers_portal_invited_on({ date: formatDate(contact.invitedAt) })}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<EnumBadge display={stateDisplay} value={contact.state} />
							{#if manager}
								<DeleteDialog
									form={revokePortalContact.for(String(contact.id))}
									id={String(contact.id)}
									label={m.customers_portal_revoke()}
									title={m.customers_portal_revoke_title({ email: contact.email })}
									description={m.customers_portal_revoke_description()}
								/>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.customers_portal_none()}</p>
		{/if}

		{#if manager}
			<form
				{...form.enhance(async ({ element, submit }) => {
					if (!(await submitted(submit))) return;
					toast.success(m.customers_portal_invited({ email: form.result?.email ?? "" }));
					element.reset();
				})}
				class="flex flex-col gap-4"
				novalidate
			>
				<input {...form.fields.customerId.as("hidden", String(access.customer.id))} />
				<TextField
					field={form.fields.email}
					label={m.customers_portal_email()}
					type="email"
					autocomplete="off"
				/>
				{#if access.sites.length > 1}
					<fieldset class="flex flex-col gap-2">
						<legend class="mb-1 text-sm font-medium">{m.customers_portal_sites()}</legend>
						<p class="text-xs text-muted-foreground">{m.customers_portal_sites_description()}</p>
						{#each access.sites as site (site.id)}
							<label class="flex items-center gap-2 text-sm">
								<input
									{...form.fields.siteIds.as("checkbox", String(site.id))}
									class="size-4 accent-primary"
								/>
								{site.name}
							</label>
						{/each}
						<Field.FieldError errors={form.fields.siteIds.issues()} />
					</fieldset>
				{/if}
				<Field.FieldError errors={form.fields.issues()} />
				<div>
					<SubmitButton pending={form.pending} icon={MailIcon}>
						{m.customers_portal_invite()}
					</SubmitButton>
				</div>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
