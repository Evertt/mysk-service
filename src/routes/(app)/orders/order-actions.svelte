<script lang="ts">
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";

	import type { OrderRow } from "./columns.js";

	let { order }: { order: OrderRow } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" aria-label="Order actions">
				<EllipsisIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Label>{order.number}</DropdownMenu.Label>
			<DropdownMenu.Item onclick={() => navigator.clipboard.writeText(order.number)}>
				Copy order number
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={() => navigator.clipboard.writeText(order.customer.code)}>
				Copy customer code
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
