<!--
	@component
	The user account an engineer signs in to the engineer portal with. Owners and admins can link
	one of the organization's members, or unlink it.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SelectField from "#lib/components/form/select-field.svelte";
	import { humanize } from "#lib/format.js";

	import { getEngineerAccount, linkEngineerAccount } from "./account.remote.js";

	let { engineerId }: { engineerId: number } = $props();

	const account = $derived(await getEngineerAccount(engineerId));
	const fields = $derived(linkEngineerAccount.fields);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Engineer portal</Card.Title>
		<Card.Description>
			{#if account.linked}
				Signs in as {account.linked.name} ({account.linked.email}) and sees their own orders at /my.
			{:else}
				Not linked to a user account: they can't sign in to the engineer portal.
			{/if}
		</Card.Description>
	</Card.Header>
	{#if account.canManage}
		<Card.Content>
			<form
				{...linkEngineerAccount.enhance(async ({ submit }) => {
					if (await submit()) toast.success("Account saved");
				})}
				class="flex flex-col gap-4"
			>
				<input {...fields.id.as("hidden", String(engineerId))} />
				<SelectField
					field={fields.userId}
					label="User account"
					placeholder="No account"
					value={account.linked?.userId ?? ""}
					options={account.members.map((m) => ({
						value: m.userId,
						label: `${m.name} (${m.email}) · ${m.role.split(",").map(humanize).join(", ")}`,
					}))}
					description="Members with the engineer role only use the portal."
				/>
				<Button type="submit" class="self-end" disabled={!!linkEngineerAccount.pending}>
					{#if linkEngineerAccount.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Save account
				</Button>
			</form>
		</Card.Content>
	{/if}
</Card.Root>
