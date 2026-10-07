<!--
	@component
	The sign-in page, outside the app shell. Signed-in visitors never see it: the hook sends them on.
-->
<script lang="ts">
	import { page } from "$app/state";

	import PublicShell from "../public-shell.svelte";
	import { login } from "./login.remote.js";

	const { email, _password, redirectTo } = login.fields;
	const emailId = $props.id();
	const passwordId = `${emailId}-password`;
</script>

<svelte:head>
	<title>{m.auth_sign_in_title()}</title>
</svelte:head>

<PublicShell>
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-xl">{m.auth_sign_in()}</Card.Title>
			<Card.Description>{m.auth_sign_in_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<!-- novalidate: show our own, themed messages rather than the browser's. -->
			<form {...login} novalidate>
				<input {...redirectTo.as("hidden", page.url.searchParams.get("redirectTo") ?? "")} />
				<Field.FieldGroup>
					<Field.FieldError errors={login.fields.issues()} />
					<Field.Field data-invalid={email.issues() ? true : undefined}>
						<Field.FieldLabel for={emailId}>{m.auth_email()}</Field.FieldLabel>
						<Input
							id={emailId}
							autocomplete="username"
							placeholder={m.auth_email_placeholder()}
							{...email.as("email")}
						/>
						<Field.FieldError errors={email.issues()} />
					</Field.Field>
					<Field.Field data-invalid={_password.issues() ? true : undefined}>
						<Field.FieldLabel for={passwordId}>{m.auth_password()}</Field.FieldLabel>
						<Input id={passwordId} autocomplete="current-password" {..._password.as("password")} />
						<Field.FieldError errors={_password.issues()} />
					</Field.Field>
					<Field.Field>
						<Button type="submit" disabled={!!login.pending}>
							{#if login.pending}
								<Spinner data-icon="inline-start" />
								{m.auth_signing_in()}
							{:else}
								{m.auth_sign_in()}
							{/if}
						</Button>
					</Field.Field>
				</Field.FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</PublicShell>
