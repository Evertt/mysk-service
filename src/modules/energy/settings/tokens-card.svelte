<!--
	@component
	The energy feed's integration tokens: make one (shown once, to copy), see when each was last
	used, and revoke one.
-->
<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatDateTime } from "#lib/i18n/index.ts";

	import {
		createEnergyToken,
		type getEnergySettings,
		revokeEnergyToken,
	} from "./settings.remote.ts";

	type Settings = Awaited<ReturnType<typeof getEnergySettings>>;

	let { tokens }: { tokens: Settings["tokens"] } = $props();

	/** The token just made: shown until the page is left. */
	let made = $state<string>();

	async function copy() {
		if (!made) return;
		await navigator.clipboard.writeText(made);
		toast.success(m.energy_token_copied());
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.energy_tokens_title()}</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<form
			{...createEnergyToken.enhance(async ({ element, submit }) => {
				await submitted(submit);
				const result = createEnergyToken.result;
				if (result) {
					made = result.token;
					element.reset();
				}
			})}
			class="flex flex-col gap-3 sm:flex-row sm:items-end"
		>
			<TextField
				field={createEnergyToken.fields.name}
				label={m.energy_token_name()}
				placeholder="P1-gateway Ede"
				class="sm:flex-1"
			/>
			<SubmitButton icon={KeyRoundIcon} pending={createEnergyToken.pending}>
				{m.energy_token_new()}
			</SubmitButton>
		</form>

		{#if made}
			<div class="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
				<p class="text-sm font-medium">{m.energy_token_created_title()}</p>
				<p class="text-sm text-muted-foreground">{m.energy_token_created_description()}</p>
				<div class="flex flex-wrap items-center gap-2">
					<code class="min-w-0 rounded bg-background px-2 py-1 text-xs break-all" data-new-token
						>{made}</code
					>
					<Button size="sm" variant="outline" onclick={copy}>
						<CopyIcon data-icon="inline-start" />
						{m.energy_token_copy()}
					</Button>
				</div>
			</div>
		{/if}

		{#if tokens.length}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.energy_token_name()}</Table.Head>
							<Table.Head>{m.energy_token_column_token()}</Table.Head>
							<Table.Head>{m.energy_token_column_created()}</Table.Head>
							<Table.Head>{m.energy_token_column_last_used()}</Table.Head>
							<Table.Head class="text-right"
								><span class="sr-only">{m.energy_token_revoke()}</span></Table.Head
							>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each tokens as token (token.id)}
							{@const revoke = revokeEnergyToken.for(String(token.id))}
							<Table.Row data-token={token.name}>
								<Table.Cell class="font-medium">{token.name}</Table.Cell>
								<Table.Cell><code class="text-xs">{token.prefix}…</code></Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{formatDateTime(token.createdAt)}{token.createdBy ? ` · ${token.createdBy}` : ""}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{token.lastUsedAt
										? formatDateTime(token.lastUsedAt)
										: m.energy_token_never_used()}
								</Table.Cell>
								<Table.Cell class="text-right">
									{#if token.revokedAt}
										<Badge variant="neutral">{m.energy_token_revoked()}</Badge>
									{:else}
										<form {...revoke}>
											<input {...revoke.fields.id.as("hidden", String(token.id))} />
											<SubmitButton size="sm" variant="outline" pending={revoke.pending}>
												{m.energy_token_revoke()}
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
			<p class="text-sm text-muted-foreground">{m.energy_tokens_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
