<!--
	@component
	The page an invitation email links to, outside the app shell and open to anyone with the link.
	The invited person joins with their existing account, or creates one for the invited address.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatDate } from "#lib/format.js";
	import { type MemberRole, roleLabels } from "#lib/members.js";

	import PublicShell from "../../public-shell.svelte";
	import type { PageProps } from "./$types";
	import {
		acceptInvitation,
		createAccount,
		getInvitation,
		signOutForInvitation,
	} from "./invite.remote.js";

	let { params }: PageProps = $props();

	const invitation = $derived(await getInvitation(params.id));

	const nameId = $props.id();
	const emailId = `${nameId}-email`;
	const passwordId = `${nameId}-password`;
	const confirmId = `${nameId}-confirm`;
	const { name, _password, _confirm } = createAccount.fields;

	/** E.g. `an admin`. */
	const role = (roles: string[]) => {
		const text = roles.map((r) => (roleLabels[r as MemberRole] ?? r).toLowerCase()).join(" and ");
		return `${/^[aeiou]/.test(text) ? "an" : "a"} ${text}`;
	};

	const loginHref = $derived(
		`${resolve("/login")}?redirectTo=${encodeURIComponent(`/invite/${params.id}`)}`,
	);
</script>

<svelte:head>
	<title>
		{invitation?.state === "pending" ? `Join ${invitation.organization}` : "Invitation"} · Fieldworks
	</title>
</svelte:head>

{#snippet message(title: string, description: string)}
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{title}</Card.Title>
			<Card.Description>{description}</Card.Description>
		</Card.Header>
		<Card.Footer>
			<Button href={resolve("/(app)")} variant="outline" class="w-full">Go to Fieldworks</Button>
		</Card.Footer>
	</Card.Root>
{/snippet}

<PublicShell>
	{#if !invitation}
		{@render message(
			"This invitation link isn't valid",
			"Check that you opened the whole link from the email, or ask for a new invitation.",
		)}
	{:else if invitation.state === "expired"}
		{@render message(
			"This invitation has expired",
			`Ask ${invitation.inviter ?? "an owner or admin"} of ${invitation.organization} to send you a new one.`,
		)}
	{:else if invitation.state === "accepted"}
		{@render message(
			"This invitation has been used",
			`It was accepted already. Sign in to work in ${invitation.organization}.`,
		)}
	{:else if invitation.state !== "pending"}
		{@render message(
			"This invitation was cancelled",
			`Ask ${invitation.inviter ?? "an owner or admin"} of ${invitation.organization} if you should still join.`,
		)}
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-xl">Join {invitation.organization}</Card.Title>
				<Card.Description>
					{invitation.inviter ?? "Someone"} invited <strong>{invitation.email}</strong> to work in
					{invitation.organization} as {role(invitation.roles)}. The invitation is valid until
					{formatDate(invitation.expiresAt)}.
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
								Join {invitation.organization}
							</Button>
						</Field.FieldGroup>
					</form>
				{:else if invitation.signedInAs}
					<form {...signOutForInvitation}>
						<input {...signOutForInvitation.fields.id.as("hidden", invitation.id)} />
						<Field.FieldGroup>
							<p class="text-sm text-muted-foreground">
								You're signed in as {invitation.signedInAs}. Sign out to accept it as
								{invitation.email}.
							</p>
							<Button type="submit" variant="outline" disabled={!!signOutForInvitation.pending}>
								Sign out
							</Button>
						</Field.FieldGroup>
					</form>
				{:else if invitation.hasAccount}
					<div class="flex flex-col gap-4">
						<p class="text-sm text-muted-foreground">
							You have a Fieldworks account already. Sign in as {invitation.email} to accept.
						</p>
						<Button href={loginHref}>Sign in to accept</Button>
					</div>
				{:else}
					<!-- novalidate: show our own, themed messages rather than the browser's. -->
					<form {...createAccount} novalidate>
						<input {...createAccount.fields.id.as("hidden", invitation.id)} />
						<Field.FieldGroup>
							<Field.FieldDescription>Create your account to accept.</Field.FieldDescription>
							<Field.FieldError errors={createAccount.fields.issues()} />
							<Field.Field>
								<Field.FieldLabel for={emailId}>Email</Field.FieldLabel>
								<!-- Not submitted: the account is for the invited address. Also tells password
								     managers which username the new password belongs to. -->
								<Input id={emailId} autocomplete="username" value={invitation.email} readonly />
							</Field.Field>
							<Field.Field data-invalid={name.issues() ? true : undefined}>
								<Field.FieldLabel for={nameId}>Your name</Field.FieldLabel>
								<Input id={nameId} autocomplete="name" {...name.as("text")} />
								<Field.FieldError errors={name.issues()} />
							</Field.Field>
							<Field.Field data-invalid={_password.issues() ? true : undefined}>
								<Field.FieldLabel for={passwordId}>Password</Field.FieldLabel>
								<Input id={passwordId} autocomplete="new-password" {..._password.as("password")} />
								<Field.FieldError errors={_password.issues()} />
							</Field.Field>
							<Field.Field data-invalid={_confirm.issues() ? true : undefined}>
								<Field.FieldLabel for={confirmId}>Repeat the password</Field.FieldLabel>
								<Input id={confirmId} autocomplete="new-password" {..._confirm.as("password")} />
								<Field.FieldError errors={_confirm.issues()} />
							</Field.Field>
							<Button type="submit" disabled={!!createAccount.pending}>
								{#if createAccount.pending}
									<Spinner data-icon="inline-start" />
								{/if}
								Create account and join
							</Button>
						</Field.FieldGroup>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</PublicShell>
