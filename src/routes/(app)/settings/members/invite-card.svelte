<!--
	@component
	The form that invites someone to the organization by email, with one of the `roles` the signed-in
	user may give.
-->
<script lang="ts">
	import MailIcon from "@lucide/svelte/icons/mail";
	import { toast } from "svelte-sonner";

	import { INVITATION_EXPIRES_IN, type MemberRole } from "#lib/auth/members.ts";
	import SelectField from "#lib/components/form/select-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { formatNumber } from "#lib/i18n/format.ts";
	import { label as roleLabel } from "#lib/i18n/labels.ts";

	import { invite } from "./members.remote.ts";

	let { organization, roles }: { organization: string; roles: MemberRole[] } = $props();

	const options = $derived(
		roles.map((role) => ({
			value: role,
			label: `${roleLabel("memberRole", role)}: ${roleLabel("memberRoleDescription", role)}`,
		})),
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_invite_title()}</Card.Title>
		<Card.Description>
			{m.settings_invite_description({
				organization,
				days: formatNumber(INVITATION_EXPIRES_IN / (24 * 60 * 60)),
			})}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...invite.enhance(async ({ element, submit }) => {
				if (!(await submit())) return;
				toast.success(m.settings_invitation_sent({ email: invite.result?.email ?? "" }));
				element.reset();
			})}
			class="flex flex-col gap-4 md:flex-row md:items-start"
			novalidate
		>
			<TextField
				field={invite.fields.email}
				label={m.settings_email()}
				type="email"
				placeholder={m.settings_email_placeholder()}
				autocomplete="off"
				class="md:flex-1"
			/>
			<SelectField
				field={invite.fields.role}
				label={m.settings_role()}
				value="member"
				{options}
				class="md:flex-1"
			/>
			<SubmitButton pending={invite.pending} icon={MailIcon} class="md:mt-6">
				{m.settings_send_invitation()}
			</SubmitButton>
		</form>
		<Field.FieldError errors={invite.fields.issues()} class="mt-4" />
	</Card.Content>
</Card.Root>
