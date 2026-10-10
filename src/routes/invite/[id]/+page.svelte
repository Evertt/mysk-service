<!--
	@component
	The page an invitation email links to, outside the app shell and open to anyone with the link.
	The invited person joins with their existing account, or creates one for the invited address.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { invitedAsText } from "#lib/auth/index.ts";
	import { formatDate, messageParts } from "#lib/i18n/index.ts";

	import PublicShell from "../../public-shell.svelte";
	import type { PageProps } from "./$types";
	import {
		acceptInvitation,
		createAccount,
		getInvitation,
		signOutForInvitation,
	} from "./invite.remote.ts";

	let { params }: PageProps = $props();

	const invitation = $derived(await getInvitation(params.id));

	const nameId = $props.id();
	const emailId = `${nameId}-email`;
	const passwordId = `${nameId}-password`;
	const confirmId = `${nameId}-confirm`;
	const { name, _password, _confirm } = createAccount.fields;

	/** Who invited whom where, with the email address (a slot) to show in bold. */
	const invited = (found: {
		inviter: string | null;
		organization: string;
		roles: string[];
		expiresAt: Date;
	}) =>
		messageParts<"email">((slot) =>
			m.auth_invite_description({
				inviter: found.inviter ?? m.auth_invite_someone(),
				email: slot("email"),
				organization: found.organization,
				role: invitedAsText(found.roles),
				date: formatDate(found.expiresAt),
			}),
		);

	const loginHref = $derived(
		`${resolve("/login")}?redirectTo=${encodeURIComponent(`/invite/${params.id}`)}`,
	);
</script>

<svelte:head>
	<title>
		{invitation?.state === "pending"
			? m.auth_invite_join({ organization: invitation.organization })
			: m.auth_invite_title()} · {m.common_app_name()}
	</title>
</svelte:head>

{#snippet message(title: string, description: string)}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{title}</Card.Title>
			<Card.Description>{description}</Card.Description>
		</Card.Header>
		<Card.Footer>
			<Button href={resolve("/(app)/(dashboard)")} variant="outline" class="w-full"
				>{m.auth_invite_go()}</Button
			>
		</Card.Footer>
	</Card.Root>
{/snippet}

<PublicShell>
	{#if !invitation}
		{@render message(m.auth_invite_invalid(), m.auth_invite_invalid_description())}
	{:else if invitation.state === "expired"}
		{@render message(
			m.auth_invite_expired(),
			m.auth_invite_expired_description({
				inviter: invitation.inviter ?? m.auth_invite_owner_or_admin(),
				organization: invitation.organization,
			}),
		)}
	{:else if invitation.state === "accepted"}
		{@render message(
			m.auth_invite_used(),
			m.auth_invite_used_description({ organization: invitation.organization }),
		)}
	{:else if invitation.state !== "pending"}
		{@render message(
			m.auth_invite_cancelled(),
			m.auth_invite_cancelled_description({
				inviter: invitation.inviter ?? m.auth_invite_owner_or_admin(),
				organization: invitation.organization,
			}),
		)}
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-xl">
					{m.auth_invite_join({ organization: invitation.organization })}
				</Card.Title>
				<Card.Description>
					{#each invited(invitation) as part, i (i)}{#if "text" in part}{part.text}{:else}<strong
								>{invitation.email}</strong
							>{/if}{/each}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if invitation.signedInAs === invitation.email}
					<form {...acceptInvitation}>
						<input {...acceptInvitation.fields.id.as("hidden", invitation.id)} />
						<Field.FieldGroup>
							<Field.FieldError errors={acceptInvitation.fields.allIssues()} />
							<Button type="submit" disabled={!!acceptInvitation.pending}>
								{#if acceptInvitation.pending}
									<Spinner data-icon="inline-start" />
								{/if}
								{m.auth_invite_join({ organization: invitation.organization })}
							</Button>
						</Field.FieldGroup>
					</form>
				{:else if invitation.signedInAs}
					<form {...signOutForInvitation}>
						<input {...signOutForInvitation.fields.id.as("hidden", invitation.id)} />
						<Field.FieldGroup>
							<p class="text-sm text-muted-foreground">
								{m.auth_invite_signed_in_as({
									current: invitation.signedInAs,
									email: invitation.email,
								})}
							</p>
							<Button type="submit" variant="outline" disabled={!!signOutForInvitation.pending}>
								{m.common_sign_out()}
							</Button>
						</Field.FieldGroup>
					</form>
				{:else if invitation.hasAccount}
					<div class="flex flex-col gap-4">
						<p class="text-sm text-muted-foreground">
							{m.auth_invite_has_account({ email: invitation.email })}
						</p>
						<Button href={loginHref}>{m.auth_invite_sign_in_to_accept()}</Button>
					</div>
				{:else}
					<!-- novalidate: show our own, themed messages rather than the browser's. -->
					<form {...createAccount} novalidate>
						<input {...createAccount.fields.id.as("hidden", invitation.id)} />
						<Field.FieldGroup>
							<Field.FieldDescription>{m.auth_invite_create_description()}</Field.FieldDescription>
							<Field.FieldError errors={createAccount.fields.issues()} />
							<Field.Field>
								<Field.FieldLabel for={emailId}>{m.auth_email()}</Field.FieldLabel>
								<!-- Not submitted: the account is for the invited address. Also tells password
								     managers which username the new password belongs to. -->
								<Input id={emailId} autocomplete="username" value={invitation.email} readonly />
							</Field.Field>
							<Field.Field data-invalid={name.issues() ? true : undefined}>
								<Field.FieldLabel for={nameId}>{m.auth_invite_your_name()}</Field.FieldLabel>
								<Input id={nameId} autocomplete="name" {...name.as("text")} />
								<Field.FieldError errors={name.issues()} />
							</Field.Field>
							<Field.Field data-invalid={_password.issues() ? true : undefined}>
								<Field.FieldLabel for={passwordId}>{m.auth_password()}</Field.FieldLabel>
								<Input id={passwordId} autocomplete="new-password" {..._password.as("password")} />
								<Field.FieldError errors={_password.issues()} />
							</Field.Field>
							<Field.Field data-invalid={_confirm.issues() ? true : undefined}>
								<Field.FieldLabel for={confirmId}
									>{m.auth_invite_repeat_password()}</Field.FieldLabel
								>
								<Input id={confirmId} autocomplete="new-password" {..._confirm.as("password")} />
								<Field.FieldError errors={_confirm.issues()} />
							</Field.Field>
							<Button type="submit" disabled={!!createAccount.pending}>
								{#if createAccount.pending}
									<Spinner data-icon="inline-start" />
								{/if}
								{m.auth_invite_create_and_join()}
							</Button>
						</Field.FieldGroup>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</PublicShell>
