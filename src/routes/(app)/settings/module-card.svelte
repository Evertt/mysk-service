<!--
	@component
	A module on the settings page: what it is, whether it's on, and for managers the button to switch
	it. Switching on also switches on what it requires; switching off first asks, when other modules
	need it, because those go off with it (`setModules()` takes all of them together).
-->
<script lang="ts">
	import type { Component } from "svelte";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { formatDate } from "#lib/i18n/index.ts";
	import { dependentsOf, requirementsOf } from "#lib/modules/graph.ts";
	import type { ModuleId } from "#lib/modules/ids.ts";

	import { type getOrganizationSettings, setModules } from "./settings.remote.ts";

	type Module = Awaited<ReturnType<typeof getOrganizationSettings>>["modules"][number];

	let {
		module,
		modules,
		canManage,
		icon: Icon,
		settingsHref,
	}: {
		module: Module;
		/** Every module, to see which are on. */
		modules: Module[];
		canManage: boolean;
		icon?: Component<{ class?: string }>;
		/** The page where the module is set up, linked to while it's on. */
		settingsHref?: string;
	} = $props();

	const form = $derived(setModules.for(module.id));
	const isOn = (id: ModuleId) => modules.find((other) => other.id === id)?.on ?? false;
	const names = (ids: ModuleId[]) =>
		ids.map((id) => modules.find((other) => other.id === id)?.label ?? id).join(", ");

	/** What switching this one on also switches on, and switching it off also switches off. */
	const needed = $derived(requirementsOf(module.id).filter((id) => !isOn(id)));
	const needing = $derived(dependentsOf(module.id).filter(isOn));
	/** Switching this one off asks first, in a dialog, which shows a refusal itself. */
	const asksFirst = $derived(canManage && !module.alwaysOn && module.on && needing.length > 0);
</script>

<div class="flex items-start gap-4 rounded-lg border p-4" data-module={module.id}>
	{#if Icon}
		<Icon class="mt-0.5 size-5 text-muted-foreground" />
	{/if}
	<!-- On a phone the button goes under the text, which would otherwise be squeezed beside it. -->
	<div class="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-3">
		<div class="flex min-w-0 flex-1 basis-56 flex-col gap-1">
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-medium">{module.label}</span>
				{#if module.alwaysOn}
					{#if !canManage}
						<Badge variant="secondary">{m.settings_modules_always_on()}</Badge>
					{/if}
				{:else if module.on && module.enabledAt}
					<Badge variant="secondary"
						>{m.settings_enabled_since({ date: formatDate(module.enabledAt) })}</Badge
					>
				{:else}
					<Badge variant="outline">{m.settings_disabled()}</Badge>
				{/if}
			</div>
			<p class="text-sm text-muted-foreground">{module.description}</p>
			{#if canManage && !module.on && needed.length}
				<p class="text-sm text-muted-foreground">
					{m.settings_modules_also_enables({ modules: names(needed) })}
				</p>
			{/if}
			{#if !asksFirst}
				<Field.FieldError errors={form.fields.allIssues()} />
			{/if}
		</div>
		{#if settingsHref && module.on}
			<Button href={settingsHref} variant="outline" size="sm">
				{m.settings_modules_set_up()}
			</Button>
		{/if}
		{#if canManage}
			{#if module.alwaysOn}
				<Button variant="outline" size="sm" disabled>{m.settings_modules_always_on()}</Button>
			{:else if asksFirst}
				<ConfirmDialog
					{form}
					title={m.settings_modules_disable_title({ module: module.label })}
					description={m.settings_modules_also_disables({ modules: names(needing) })}
					confirmLabel={m.settings_disable()}
				>
					{#snippet trigger(props)}
						<Button {...props} variant="outline" size="sm">{m.settings_disable()}</Button>
					{/snippet}
					{#each [module.id, ...needing] as id (id)}
						<input hidden {...form.fields.disable.as("checkbox", id, true)} />
					{/each}
				</ConfirmDialog>
			{:else}
				<form {...form}>
					{#if module.on}
						<input hidden {...form.fields.disable.as("checkbox", module.id, true)} />
					{:else}
						{#each [module.id, ...needed] as id (id)}
							<input hidden {...form.fields.enable.as("checkbox", id, true)} />
						{/each}
					{/if}
					<SubmitButton
						variant={module.on ? "outline" : "default"}
						size="sm"
						pending={form.pending}
					>
						{module.on ? m.settings_disable() : m.settings_enable()}
					</SubmitButton>
				</form>
			{/if}
		{/if}
	</div>
</div>
