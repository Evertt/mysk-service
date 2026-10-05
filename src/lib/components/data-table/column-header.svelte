<!--
	@component
	Column header with a menu to sort or hide the column. Falls back to plain text for columns
	that can do neither.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";

	import { cn } from "#lib/utils.js";

	import { useHeaderContext } from "./table.svelte.js";

	const header = useHeaderContext();
	const column = $derived(header.column);
	const meta = $derived(column.columnDef.meta);
	const label = $derived(meta?.label ?? column.id);
	const sorted = $derived(column.getIsSorted());
</script>

{#if !column.getCanSort() && !column.getCanHide()}
	<span class={cn(meta?.align === "end" && "block text-right")}>{label}</span>
{:else}
	<div class={cn("flex", meta?.align === "end" && "justify-end")}>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="sm" class="-mx-2.5">
						{label}
						{#if sorted === "desc"}
							<ArrowDownIcon data-icon="inline-end" />
						{:else if sorted === "asc"}
							<ArrowUpIcon data-icon="inline-end" />
						{:else if column.getCanSort()}
							<ChevronsUpDownIcon data-icon="inline-end" class="text-muted-foreground" />
						{/if}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align={meta?.align === "end" ? "end" : "start"} class="min-w-36">
				{#if column.getCanSort()}
					<DropdownMenu.Group>
						<DropdownMenu.Item onclick={() => column.toggleSorting(false)}>
							<ArrowUpIcon />
							Ascending
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => column.toggleSorting(true)}>
							<ArrowDownIcon />
							Descending
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				{/if}
				{#if column.getCanSort() && column.getCanHide()}
					<DropdownMenu.Separator />
				{/if}
				{#if column.getCanHide()}
					<DropdownMenu.Group>
						<DropdownMenu.Item onclick={() => column.toggleVisibility(false)}>
							<EyeOffIcon />
							Hide column
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
