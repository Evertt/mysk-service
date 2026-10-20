<!--
	@component
	The one way to build a module's settings page (`routes/(app)/settings/+page.svelte`): its title
	in the tab and the header, with the breadcrumbs back to the module's section. Every member reads
	it; for settings kept with `defineTenantSettings()` (`#lib/server/modules/settings.ts`), a
	manager gets the form (`form`, its `fields` and an optional `footer` under them) and the others
	what's set, as `DetailItem`s (`details`). What else the page shows (integration tokens, a list)
	goes in `children`, below.
-->
<script lang="ts" generics="Form extends DialogForm">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import { toast } from "svelte-sonner";

	import { canManage } from "#lib/auth/can-manage.ts";
	import type { DialogForm } from "#lib/components/form/dialogs.svelte.ts";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import type { ModuleId } from "#lib/modules/ids.ts";
	import { modulePages, modules } from "#lib/modules/manifests.ts";

	let {
		module: moduleId,
		title,
		description,
		form,
		fields,
		footer,
		details,
		children,
	}: {
		module: ModuleId;
		title: string;
		description?: string;
		/** The settings' form (`saveSettings`), for managers (`canManage()`): the others get `details`. */
		form?: Form;
		/** The form's fields, in their `Field.FieldGroup`. */
		fields?: Snippet;
		/** Under the fields, in the card's footer (when the daily run last ran, say). */
		footer?: Snippet;
		/** What's set, as `DetailItem`s, for those who may not change it. */
		details?: Snippet;
		/** The page's other cards, below. */
		children?: Snippet;
	} = $props();

	const label = $derived(modules.find((module) => module.id === moduleId)?.label ?? moduleId);
	const home = $derived(modulePages[moduleId].home);
	const homeHref = $derived(home ? resolve(home) : undefined);
</script>

<PageHeader
	{title}
	{description}
	breadcrumbs={[{ label, href: homeHref }, { label: m.common_settings() }]}
/>

{#if form && fields && (await canManage())}
	<form
		{...form.enhance(async ({ submit }) => {
			if (await submitted(submit)) toast.success(m.common_settings_saved());
		})}
		class="flex max-w-2xl flex-col gap-6"
	>
		<Card.Root>
			<Card.Content>
				{@render fields()}
			</Card.Content>
			{#if footer}
				<Card.Footer>{@render footer()}</Card.Footer>
			{/if}
		</Card.Root>
		<FormActions
			pending={form.pending}
			submitLabel={m.common_save_settings()}
			cancelHref={homeHref}
		/>
	</form>
{:else if details}
	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Description>{m.common_settings_managers()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<dl class="grid gap-4 sm:grid-cols-3">
				{@render details()}
			</dl>
		</Card.Content>
	</Card.Root>
{/if}

{#if children}
	<div class="flex max-w-4xl flex-col gap-6">
		{@render children()}
	</div>
{/if}
