<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDate, humanize } from "#lib/format.js";
	import { modules as moduleRegistry } from "#lib/modules.js";

	import { getSettings, setModule } from "./settings.remote.js";

	const settings = $derived(await getSettings());
	const icons = new Map(moduleRegistry.map((m) => [m.id, m.icon]));
</script>

<svelte:head>
	<title>Organization settings</title>
</svelte:head>

<PageHeader title="Organization settings" description={settings.name} />

<div class="grid items-start gap-6 lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>Modules</Card.Title>
			<Card.Description>
				Optional features on top of the core. {settings.canManage
					? "In a live setup these would follow the organization's subscription."
					: "Owners and admins can change these."}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#each settings.modules as module (module.id)}
				{@const Icon = icons.get(module.id)}
				{@const toggle = setModule.for(module.id)}
				<div class="flex items-start gap-4 rounded-lg border p-4">
					{#if Icon}
						<Icon class="mt-0.5 size-5 text-muted-foreground" />
					{/if}
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{module.label}</span>
							{#if module.enabledAt}
								<Badge variant="secondary">Enabled since {formatDate(module.enabledAt)}</Badge>
							{:else}
								<Badge variant="outline">Disabled</Badge>
							{/if}
						</div>
						<p class="text-sm text-muted-foreground">{module.description}</p>
					</div>
					{#if settings.canManage}
						<form {...toggle}>
							<input {...toggle.fields.moduleId.as("hidden", module.id)} />
							<Button
								{...toggle.fields.enabled.as("submit", module.enabledAt ? "off" : "on")}
								variant={module.enabledAt ? "outline" : "default"}
								size="sm"
								disabled={!!toggle.pending}
							>
								{#if toggle.pending}
									<Spinner data-icon="inline-start" />
								{/if}
								{module.enabledAt ? "Disable" : "Enable"}
							</Button>
						</form>
					{/if}
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Members</Card.Title>
			<Card.Description>People who can sign in to this organization.</Card.Description>
			<Card.Action>
				<Button href={resolve("/(app)/settings/members")} variant="outline" size="sm">
					{settings.canManage ? "Manage members" : "View members"}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Role</Table.Head>
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
											>{humanize(role)}</Badge
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
