<!--
	@component
	The user account an engineer signs in to the engineer portal with. Owners and admins can link
	one of the organization's members, or unlink it.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { canManage } from "#lib/auth/can-manage.ts";
	import { parseRoles } from "#lib/auth/index.ts";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import { labelOrValue } from "#lib/i18n/index.ts";

	import { getEngineerAccount, linkEngineerAccount } from "./account.remote.ts";

	let { engineerId }: { engineerId: number } = $props();

	const account = $derived(await getEngineerAccount(engineerId));
	const fields = $derived(linkEngineerAccount.fields);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.engineers_portal_title()}</Card.Title>
		<Card.Description>
			{#if account.linked}
				{m.engineers_portal_linked({ name: account.linked.name, email: account.linked.email })}
			{:else}
				{m.engineers_portal_not_linked()}
			{/if}
		</Card.Description>
	</Card.Header>
	{#if await canManage()}
		<Card.Content>
			<form
				{...linkEngineerAccount.enhance(async ({ submit }) => {
					if (await submitted(submit)) toast.success(m.engineers_account_saved());
				})}
				class="flex flex-col gap-4"
			>
				<input {...fields.id.as("hidden", String(engineerId))} />
				<SelectField
					field={fields.userId}
					label={m.engineers_account_field()}
					placeholder={m.engineers_account_none()}
					value={account.linked?.userId ?? ""}
					options={account.members.map((member) => ({
						value: member.userId,
						label: `${member.name} (${member.email}) · ${parseRoles(member.role)
							.map((role) => labelOrValue("memberRole", role))
							.join(", ")}`,
					}))}
					description={m.engineers_account_description()}
				/>
				<SubmitButton class="self-end" pending={linkEngineerAccount.pending}>
					{m.engineers_account_save()}
				</SubmitButton>
			</form>
		</Card.Content>
	{/if}
</Card.Root>
