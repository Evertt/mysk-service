<!--
	@component
	The one way to show a module's integration tokens, on its settings page: when each was last
	used, and for managers making one (shown once, to copy) and revoking one. Members see them
	read-only: a token's first characters only, like everyone. `placeholder` is an example name
	(the system that posts with it).
-->
<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatDateTime } from "#lib/i18n/index.ts";
	import type { IntegrationModuleId } from "#lib/modules/manifests.ts";

	import {
		createIntegrationToken,
		getIntegrationTokens,
		revokeIntegrationToken,
	} from "./integration-tokens.remote.ts";

	let { module: moduleId, placeholder }: { module: IntegrationModuleId; placeholder?: string } =
		$props();

	const { tokens, canManage } = $derived(await getIntegrationTokens(moduleId));

	/** The token just made: shown until the page is left. */
	let made = $state<string>();

	async function copy() {
		if (!made) return;
		await navigator.clipboard.writeText(made);
		toast.success(m.common_token_copied());
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.common_tokens_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if canManage}
			<form
				{...createIntegrationToken.enhance(async ({ element, submit }) => {
					if (!(await submitted(submit))) return;
					const result = createIntegrationToken.result;
					if (result) {
						made = result.token;
						element.reset();
					}
				})}
				class="flex flex-col gap-3 sm:flex-row sm:items-end"
			>
				<input {...createIntegrationToken.fields.module.as("hidden", moduleId)} />
				<TextField
					field={createIntegrationToken.fields.name}
					label={m.common_token_name()}
					{placeholder}
					class="sm:flex-1"
				/>
				<SubmitButton icon={KeyRoundIcon} pending={createIntegrationToken.pending}>
					{m.common_token_new()}
				</SubmitButton>
			</form>

			{#if made}
				<div class="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
					<p class="text-sm font-medium">{m.common_token_created_title()}</p>
					<p class="text-sm text-muted-foreground">{m.common_token_created_description()}</p>
					<div class="flex flex-wrap items-center gap-2">
						<code class="min-w-0 rounded bg-background px-2 py-1 text-xs break-all" data-new-token
							>{made}</code
						>
						<Button size="sm" variant="outline" onclick={copy}>
							<CopyIcon data-icon="inline-start" />
							{m.common_token_copy()}
						</Button>
					</div>
				</div>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground" data-managers-only>{m.common_tokens_managers()}</p>
		{/if}

		{#if tokens.length}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.common_token_name()}</Table.Head>
							<Table.Head>{m.common_token_column_token()}</Table.Head>
							<Table.Head>{m.common_token_column_created()}</Table.Head>
							<Table.Head>{m.common_token_column_last_used()}</Table.Head>
							<Table.Head class="text-right"
								><span class="sr-only">{m.common_token_revoke()}</span></Table.Head
							>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each tokens as token (token.id)}
							{@const revoke = revokeIntegrationToken.for(String(token.id))}
							<Table.Row data-token={token.name}>
								<Table.Cell class="font-medium">{token.name}</Table.Cell>
								<Table.Cell><code class="text-xs">{token.prefix}…</code></Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{formatDateTime(token.createdAt)}{token.createdBy ? ` · ${token.createdBy}` : ""}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{token.lastUsedAt
										? formatDateTime(token.lastUsedAt)
										: m.common_token_never_used()}
								</Table.Cell>
								<Table.Cell class="text-right">
									{#if token.revokedAt}
										<Badge variant="neutral">{m.common_token_revoked()}</Badge>
									{:else if canManage}
										<form {...revoke}>
											<input {...revoke.fields.module.as("hidden", moduleId)} />
											<input {...revoke.fields.id.as("hidden", String(token.id))} />
											<SubmitButton size="sm" variant="outline" pending={revoke.pending}>
												{m.common_token_revoke()}
											</SubmitButton>
										</form>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{m.common_tokens_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
