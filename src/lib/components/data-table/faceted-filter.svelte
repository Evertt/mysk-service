<!--
	@component
	Multi-select filter for a column with a fixed set of values (status, type, …), showing how
	many rows have each value. The column needs `filterFn: "oneOf"`.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CirclePlusIcon from "@lucide/svelte/icons/circle-plus";
	import type { Component } from "svelte";

	import { cn } from "#lib/utils.js";

	import { useTableContext } from "./table.svelte.js";

	interface Option {
		value: string;
		label: string;
		icon?: Component;
	}

	let { columnId, title, options }: { columnId: string; title: string; options: Option[] } =
		$props();

	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	const counts = $derived(column?.getFacetedUniqueValues() ?? new Map<unknown, number>());
	const selected = $derived(new Set((column?.getFilterValue() as string[] | undefined) ?? []));

	function toggle(value: string) {
		const next = new Set(selected);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		column?.setFilterValue(next.size ? [...next] : undefined);
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="border-dashed">
				<CirclePlusIcon data-icon="inline-start" />
				{title}
				{#if selected.size}
					<Separator orientation="vertical" class="mx-0.5 h-4" />
					{#if selected.size > 2}
						<Badge variant="secondary">{selected.size} selected</Badge>
					{:else}
						{#each options.filter((option) => selected.has(option.value)) as option (option.value)}
							<Badge variant="secondary">{option.label}</Badge>
						{/each}
					{/if}
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-52 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={title} />
			<Command.List>
				<Command.Empty>No results found.</Command.Empty>
				<Command.Group>
					{#each options as option (option.value)}
						<Command.Item value={option.label} onSelect={() => toggle(option.value)}>
							<div
								class={cn(
									"flex size-4 items-center justify-center rounded-[4px] border",
									selected.has(option.value)
										? "border-primary bg-primary text-primary-foreground"
										: "border-input [&_svg]:invisible",
								)}
							>
								<CheckIcon class="size-3.5" />
							</div>
							{#if option.icon}
								<option.icon class="text-muted-foreground" />
							{/if}
							<span>{option.label}</span>
							<span class="ml-auto font-mono text-xs text-muted-foreground">
								{counts.get(option.value) ?? 0}
							</span>
						</Command.Item>
					{/each}
				</Command.Group>
				{#if selected.size}
					<Command.Separator />
					<Command.Group>
						<Command.Item class="justify-center" onSelect={() => column?.setFilterValue(undefined)}>
							Clear filters
						</Command.Item>
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
