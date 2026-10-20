<!--
	@component
	The order types on their settings page, in their order: each with the tenant's own names (or
	the standard ones, muted), whether the order form offers it and what needs it, and a button to
	set it up. For owners and admins.
-->
<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import { label, languageNames, standardLabel } from "#lib/i18n/index.ts";
	import { locales } from "#lib/paraglide/runtime.js";

	import { orderTypeDisplay as typeDisplay } from "../display.ts";
	import OrderTypeDialog from "./order-type-dialog.svelte";
	import type { getOrderTypeSetup } from "./type-settings.remote.ts";

	let {
		types,
	}: {
		types: Awaited<ReturnType<typeof getOrderTypeSetup>>;
	} = $props();

	/** The type whose dialog is open, if any. */
	let editing = $state<string | null>(null);
</script>

<Card.Root data-testid="order-types">
	<Card.Header>
		<Card.Title>{m.orders_types_title()}</Card.Title>
		<Card.Description>{m.orders_types_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.orders_types_column_type()}</Table.Head>
					{#each locales as locale (locale)}
						<Table.Head>{languageNames[locale]}</Table.Head>
					{/each}
					<Table.Head>{m.orders_types_column_form()}</Table.Head>
					<Table.Head><span class="sr-only">{m.common_edit()}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each types as setting (setting.type)}
					{@const Icon = typeDisplay[setting.type].icon}
					{@const name = label("orderType", setting.type)}
					<Table.Row data-order-type={setting.type}>
						<Table.Cell>
							<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
								<Icon class="size-4 text-muted-foreground" />
								{standardLabel("orderType", setting.type)}
							</span>
						</Table.Cell>
						{#each locales as locale (locale)}
							<Table.Cell data-locale={locale}>
								{#if setting.names[locale]}
									{setting.names[locale]}
								{:else}
									<span class="text-muted-foreground">
										{standardLabel("orderType", setting.type, locale)}
									</span>
								{/if}
							</Table.Cell>
						{/each}
						<Table.Cell>
							<div class="flex flex-col items-start gap-1">
								<Badge variant={setting.hidden ? "outline" : "secondary"}>
									{setting.hidden ? m.orders_types_hidden() : m.orders_types_shown()}
								</Badge>
								{#if setting.requiredBy.length}
									<span class="text-xs text-muted-foreground">
										{m.orders_types_needed_by({ needs: setting.requiredBy.join(", ") })}
									</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={m.orders_types_edit({ name })}
								title={m.orders_types_edit({ name })}
								onclick={() => (editing = setting.type)}
							>
								<PencilIcon />
							</Button>
							<OrderTypeDialog
								{setting}
								bind:open={
									() => editing === setting.type, (open) => (editing = open ? setting.type : null)
								}
							/>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
