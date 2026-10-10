<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { labelOrValue } from "#lib/i18n";
	import { modules as moduleRegistry } from "#lib/modules/manifests.ts";

	import ModuleCard from "./module-card.svelte";
	import { getOrganizationSettings } from "./settings.remote.ts";

	const settings = $derived(await getOrganizationSettings());
	const icons = new Map(moduleRegistry.map((m) => [m.id, m.icon]));
</script>

<svelte:head>
	<title>{m.common_organization_settings()}</title>
</svelte:head>

<PageHeader title={m.common_organization_settings()} description={settings.name} />

<div class="grid items-start gap-6 lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_modules()}</Card.Title>
			<Card.Description>
				{m.settings_modules_description()}
				{settings.canManage
					? m.settings_modules_subscription()
					: m.settings_managers_change_these()}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#each settings.modules as module (module.id)}
				<ModuleCard
					{module}
					modules={settings.modules}
					canManage={settings.canManage}
					icon={icons.get(module.id)}
				/>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_members()}</Card.Title>
			<Card.Description>{m.settings_members_description()}</Card.Description>
			<Card.Action>
				<Button href={resolve("/(app)/settings/members")} variant="outline" size="sm">
					{settings.canManage ? m.settings_manage_members() : m.settings_view_members()}
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
</div>
