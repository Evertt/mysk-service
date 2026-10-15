<!--
	@component
	A badge that is also a select: it looks like the badge of its value, with a small arrow, and
	opens the list of values it can take. For enum-like fields that change during a record's life,
	edited right in a table (an order's status, whether an engineer is active).

	It doesn't change anything itself: it calls `onchange` with the value chosen, and shows `current`
	until the caller passes another (optimistically, or once the change is saved).

	A table shows one on every row, and a select is a lot to set up a hundred times for lists that
	are mostly never opened: like the row actions menu, until the pointer or the focus reaches it,
	it's a plain button that looks the same, which makes way for the select's own trigger then
	(keeping the focus), and a tap that lands on the plain button opens the list. With nothing else
	to choose, it's just the badge.

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
</script>

<script lang="ts" generics="T extends string">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import { Select as SelectPrimitive } from "bits-ui";
	import type { Attachment } from "svelte/attachments";

	import { badgeVariants } from "#lib/components/ui/badge/index.ts";
	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	let {
		current,
		options,
		label,
		onchange,
	}: {
		/** The value shown. */
		current: BadgeOption<T>;
		/** The values it can take (`current`'s among them), in the order to list them. */
		options: BadgeOption<T>[];
		/** What it's the value of, e.g. "Status of WO-0001"; read out with the value. */
		label: string;
		/** Called with the value chosen, when it's another than `current`'s. */
		onchange: (value: T) => void;
	} = $props();

	const theme = useTheme();

	const editable = $derived(options.some((option) => option.value !== current.value));
	const name = $derived(m.common_badge_select_label({ label, value: current.label }));
	const classes = $derived(
		cn(
			badgeVariants({ variant: current.variant }),
			theme.classes("badge", { variant: current.variant }),
			// Somewhat larger to tap on a touch screen.
			"cursor-pointer pr-1 outline-none pointer-coarse:h-7 pointer-coarse:px-2.5",
		),
	);

	/** Whether the select is set up: once the pointer or the focus has reached the button. */
	let active = $state(false);
	let open = $state(false);
	/** The plain button had the focus, which goes to the trigger that replaces it. */
	let focused = false;

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

{#snippet face()}
	{#if current.icon}
		<current.icon data-icon="inline-start" />
	{/if}
	{current.label}
	<ChevronDownIcon data-icon="inline-end" class="opacity-60" />
{/snippet}

{#if !editable}
	<Badge variant={current.variant}>
		{#if current.icon}
			<current.icon data-icon="inline-start" />
		{/if}
		{current.label}
	</Badge>
{:else if active}
	<SelectPrimitive.Root type="single" bind:value={selected} bind:open onValueChange={choose}>
		<SelectPrimitive.Trigger
			class={classes}
			aria-label={name}
			data-slot="badge-select"
			{@attach takeFocus}
		>
			{@render face()}
		</SelectPrimitive.Trigger>
		<Select.Content align="start">
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
		{@render face()}
	</button>
{/if}
