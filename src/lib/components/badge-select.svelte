<!--
	@component
	A badge that is also a select: it looks like the badge of its value, with a small arrow, and
	opens the list of values it can take. For enum-like fields that change during a record's life,
	edited right in a table (an order's status, whether an engineer is active).

	It doesn't change anything itself: it calls `onchange` with the value chosen, and shows `current`
	until the caller passes another (optimistically, or once the change is saved).

	With a `filter` (in a table, to filter it by the value, see
	`#lib/components/data-table/cell-filter.svelte.ts`), the badge is split in two: its value is a
	button that filters, and only its arrow, with a background of its own on hover, opens the list.
	Each has its own name ("Filter by Quote", "Change status of ORD-0001: Quote"). Without anything
	else to choose, the whole badge filters.

	A table shows one on every row, and a select is a lot to set up a hundred times for lists that
	are mostly never opened: like the row actions menu, until the pointer or the focus reaches it,
	it's a plain button that looks the same, which makes way for the select's own trigger then
	(keeping the focus), and a tap that lands on the plain button opens the list. With nothing else
	to choose and no filter, it's just the badge.

	The table's row navigation only handles keys pressed on a row itself, so the select's keys
	(Enter, Space, the arrows) stay its own.
-->
<script lang="ts" module>
	import type { Component } from "svelte";

	import type { BadgeVariant } from "#lib/components/ui/badge/index.ts";

	/** A value as its badge shows it. */
	export interface BadgeOption<T extends string> {
		value: T;
		label: string;
		icon?: Component;
		variant?: BadgeVariant;
	}

	/** What clicking the badge's value does instead of opening the list, e.g. filter a table. */
	export interface BadgeFilter {
		/** The value's button's name, e.g. "Filter by Quote". */
		readonly label: string;
		toggle(): void;
	}
</script>

<script lang="ts" generics="T extends string">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { Select as SelectPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { badgeVariants } from "#lib/components/ui/badge/index.ts";
	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		current,
		options,
		label,
		onchange,
		filter,
	}: {
		/** The value shown. */
		current: BadgeOption<T>;
		/** The values it can take (`current`'s among them), in the order to list them. */
		options: BadgeOption<T>[];
		/** What it changes, e.g. "Change status of WO-0001"; read out with the value. */
		label: string;
		/** Called with the value chosen, when it's another than `current`'s. */
		onchange: (value: T) => void;
		/** Splits the badge: clicking its value does this, and only the arrow opens the list. */
		filter?: BadgeFilter;
	} = $props();

	const theme = useTheme();

	const editable = $derived(options.some((option) => option.value !== current.value));
	const name = $derived(m.common_badge_select_label({ label, value: current.label }));
	const badge = $derived(
		cn(
			badgeVariants({ variant: current.variant }),
			theme.classes("badge", { variant: current.variant }),
		),
	);
	// Somewhat larger to tap on a touch screen.
	const whole = $derived(
		cn(badge, "cursor-pointer pr-1 outline-none pointer-coarse:h-7 pointer-coarse:px-2.5"),
	);
	/** A part of a split badge: the value, or the arrow. */
	const part =
		"inline-flex h-full cursor-pointer items-center gap-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&>svg]:pointer-events-none [&>svg]:size-3!";

	/** Whether the select is set up: once the pointer or the focus has reached the button. */
	let active = $state(false);
	let open = $state(false);
	/** The plain button had the focus, which goes to the trigger that replaces it. */
	let focused = false;
	/** A split badge, which the list lines up with rather than with the arrow. */
	let anchor = $state<HTMLElement | null>(null);

	// Follows `current`, and holds the value chosen until the caller passes it (or goes back).
	let selected = $derived(current.value);

	const takeFocus: Attachment<HTMLElement> = (element) => {
		if (focused) element.focus();
		focused = false;
	};

	function choose(value: string) {
		if (value !== current.value) onchange(value as T);
	}
</script>

{#snippet value()}
	{#if current.icon}
		<current.icon data-icon="inline-start" />
	{/if}
	{current.label}
{/snippet}

{#snippet arrow()}
	<ChevronDownIcon data-icon="inline-end" class="opacity-60" />
{/snippet}

{#snippet face()}
	{@render value()}
	{@render arrow()}
{/snippet}

<!-- The select, or until it's needed, a plain button that looks the same. -->
{#snippet chooser(classes: string, content: Snippet)}
	{#if active}
		<SelectPrimitive.Root type="single" bind:value={selected} bind:open onValueChange={choose}>
			<SelectPrimitive.Trigger
				class={classes}
				aria-label={name}
				data-slot="badge-select"
				{@attach takeFocus}
			>
				{@render content()}
			</SelectPrimitive.Trigger>
			<Select.Content align="start" customAnchor={anchor}>
				{#each options as option (option.value)}
					<Select.Item value={option.value} label={option.label}>
						{#if option.icon}
							<option.icon />
						{/if}
						{option.label}
					</Select.Item>
				{/each}
			</Select.Content>
		</SelectPrimitive.Root>
	{:else}
		<button
			type="button"
			class={classes}
			aria-label={name}
			aria-haspopup="listbox"
			aria-expanded="false"
			data-slot="badge-select"
			data-state="closed"
			onpointerenter={() => (active = true)}
			onfocus={() => {
				focused = true;
				active = true;
			}}
			onclick={() => {
				active = true;
				open = true;
			}}
		>
			{@render content()}
		</button>
	{/if}
{/snippet}

{#if filter}
	<!-- The pointer reaching either part sets the select up. -->
	<span
		role="group"
		class={cn(badge, "gap-0 p-0! pointer-coarse:h-7")}
		data-slot="badge-split"
		{@attach (element) => {
			anchor = element;
			return () => (anchor = null);
		}}
		onpointerenter={() => {
			if (editable) active = true;
		}}
	>
		<button
			type="button"
			class={cn(
				part,
				"pl-2 hover:bg-current/10 has-data-[icon=inline-start]:pl-1.5 pointer-coarse:pl-2.5",
				editable ? "pr-1" : "pr-2 pointer-coarse:pr-2.5",
			)}
			aria-label={filter.label}
			title={filter.label}
			data-slot="badge-filter"
			onclick={() => filter.toggle()}
		>
			{@render value()}
		</button>
		{#if editable}
			{@render chooser(
				cn(part, "border-l border-current/15 px-1 hover:bg-current/20 pointer-coarse:px-1.5"),
				arrow,
			)}
		{/if}
	</span>
{:else if !editable}
	<Badge variant={current.variant}>
		{@render value()}
	</Badge>
{:else}
	{@render chooser(whole, face)}
{/if}
