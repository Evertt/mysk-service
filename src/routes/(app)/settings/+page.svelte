<script lang="ts">
	import { resolve } from "$app/paths";

	import { canManage } from "#lib/auth/can-manage.ts";
	import { masonry, masonryGrid } from "#lib/components/masonry.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getEquipmentCategories } from "#lib/equipment/remotes.ts";
	import { label, labelOrValue } from "#lib/i18n/index.ts";
	import { orderTypes } from "#lib/models.ts";
	import type { ModuleId } from "#lib/modules/ids.ts";
	import { modulePages, modules as moduleRegistry } from "#lib/modules/manifests.ts";
	import { getOrderTypes } from "#lib/orders/remotes.ts";

	import ModuleCard from "./module-card.svelte";
	import { getOrganizationSettings } from "./settings.remote.ts";

	const [settings, manager, categories, typeSettings] = $derived(
		await Promise.all([
			getOrganizationSettings(),
			canManage(),
			getEquipmentCategories(),
			getOrderTypes(),
		]),
	);
	const icons = new Map(moduleRegistry.map((m) => [m.id, m.icon]));
	/** Where a module is set up, if it has a settings page (`modulePages`). */
	const settingsHref = (id: ModuleId) => {
		const route = modulePages[id].settings;
		return route && resolve(route);
	};
</script>

<PageHeader title={m.common_organization_settings()} description={settings.name} />

<!-- The cards, packed into columns (`#lib/components/masonry.ts`): columns at least 20rem wide (the
	members' table still fits), two at most, by the page's width rather than the window's (the sidebar
	takes 16rem of it). -->
<div
	class={[
		masonryGrid,
		"grid-cols-[repeat(auto-fill,minmax(min(100%,max(20rem,calc((100%_-_1.5rem)/2))),1fr))] gap-6",
	]}
	{@attach masonry}
>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_modules()}</Card.Title>
			<Card.Description>
				{m.settings_modules_description()}
				{manager ? m.settings_modules_subscription() : m.settings_managers_change_these()}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#each settings.modules as module (module.id)}
				<ModuleCard
					{module}
					modules={settings.modules}
					icon={icons.get(module.id)}
					settingsHref={settingsHref(module.id)}
				/>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if manager}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.settings_members()}</Card.Title>
				<Card.Description>{m.settings_members_description()}</Card.Description>
				<Card.Action>
					<Button href={resolve("/(app)/settings/members")} variant="outline" size="sm">
						{m.settings_manage_members()}
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.settings_column_name()}</Table.Head>
							<Table.Head>{m.settings_column_role()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each settings.members as member (member.id)}
							<Table.Row>
								<Table.Cell>
									<div class="flex flex-col">
										<span class="font-medium">{member.name}</span>
										<span class="text-xs text-muted-foreground">{member.email}</span>
									</div>
								</Table.Cell>
								<Table.Cell>
									<div class="flex gap-1">
										{#each member.roles as role (role)}
											<Badge variant={role === "member" ? "outline" : "secondary"}
												>{labelOrValue("memberRole", role)}</Badge
											>
										{/each}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root data-testid="equipment-categories-summary">
		<Card.Header>
			<Card.Title>{m.equipment_categories_title()}</Card.Title>
			<Card.Description>
				{m.equipment_categories_description()}
				{#if !manager}{m.settings_managers_change_these()}{/if}
			</Card.Description>
			{#if manager}
				<Card.Action>
					<Button
						href={resolve("/(app)/settings/equipment-categories")}
						variant="outline"
						size="sm"
					>
						{m.equipment_categories_manage()}
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if categories.length}
				<div class="flex flex-wrap gap-2">
					{#each categories as category (category.id)}
						<Badge variant="outline">{category.name}</Badge>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.equipment_categories_empty()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root data-testid="order-types-summary">
		<Card.Header>
			<Card.Title>{m.orders_types_title()}</Card.Title>
			<Card.Description>
				{m.orders_types_description()}
				{#if !manager}{m.settings_managers_change_these()}{/if}
			</Card.Description>
			{#if manager}
				<Card.Action>
					<Button href={resolve("/(app)/settings/order-types")} variant="outline" size="sm">
						{m.orders_types_manage()}
					</Button>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			<div class="flex flex-wrap gap-2">
				{#each orderTypes as type (type)}
					{@const hidden = typeSettings[type]?.hidden}
					<Badge
						variant="outline"
						class={hidden ? "text-muted-foreground line-through" : undefined}
						title={hidden ? m.orders_types_hidden() : undefined}
					>
						{label("orderType", type)}
					</Badge>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
