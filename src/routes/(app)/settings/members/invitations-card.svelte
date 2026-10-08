<!--
	@component
	The invitations that haven't been accepted yet, which owners and admins can send again or
	cancel.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { formatDate } from "#lib/format.ts";
	import { labelOrValue } from "#lib/i18n/labels.ts";

	import { cancelInvitation, getMembers, resendInvitation } from "./members.remote.ts";

	type Invitation = Awaited<ReturnType<typeof getMembers>>["invitations"][number];

	let { invitations }: { invitations: Invitation[] } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_pending()}</Card.Title>
		<Card.Description>{m.settings_pending_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if invitations.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.settings_column_email()}</Table.Head>
						<Table.Head>{m.settings_column_role()}</Table.Head>
						<Table.Head>{m.settings_column_invited()}</Table.Head>
						<Table.Head>{m.settings_column_expires()}</Table.Head>
						<Table.Head><span class="sr-only">{m.settings_column_actions()}</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each invitations as invitation (invitation.id)}
						{@const resend = resendInvitation.for(invitation.id)}
						{@const cancel = cancelInvitation.for(invitation.id)}
						<Table.Row data-invitation={invitation.email}>
							<Table.Cell class="font-medium">{invitation.email}</Table.Cell>
							<Table.Cell>{labelOrValue("memberRole", invitation.role ?? "member")}</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col">
									<span class="tabular-nums">{formatDate(invitation.invitedAt)}</span>
									{#if invitation.invitedBy}
										<span class="text-xs text-muted-foreground">
											{m.settings_invited_by({ name: invitation.invitedBy })}
										</span>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>
								{#if invitation.expired}
									<Badge variant="destructive">{m.settings_expired()}</Badge>
								{:else}
									<span class="tabular-nums">{formatDate(invitation.expiresAt)}</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								<div class="flex justify-end gap-2">
									<form
										{...resend.enhance(async ({ submit }) => {
											if (await submit())
												toast.success(m.settings_sent_again({ email: invitation.email }));
										})}
									>
										<input {...resend.fields.id.as("hidden", invitation.id)} />
										<SubmitButton variant="outline" size="sm" pending={resend.pending}>
											{m.settings_resend()}
										</SubmitButton>
									</form>
									<form
										{...cancel.enhance(async ({ submit }) => {
											if (await submit())
												toast.success(m.settings_invitation_cancelled({ email: invitation.email }));
										})}
									>
										<input {...cancel.fields.id.as("hidden", invitation.id)} />
										<SubmitButton variant="ghost" size="sm" pending={cancel.pending}>
											{m.settings_cancel_invitation()}
										</SubmitButton>
									</form>
								</div>
								<Field.FieldError
									errors={[
										...(resend.fields.allIssues() ?? []),
										...(cancel.fields.allIssues() ?? []),
									]}
									class="text-right"
								/>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-sm text-muted-foreground">{m.settings_no_pending()}</p>
		{/if}
	</Card.Content>
</Card.Root>
