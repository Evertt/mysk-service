<!--
	@component
	The organization's members and pending invitations. Owners and admins invite people, change roles
	and remove members; everyone else sees the list.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import MailIcon from "@lucide/svelte/icons/mail";
	import { toast } from "svelte-sonner";

	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDate, formatNumber } from "#lib/format.js";
	import { label as roleLabel, labelOrValue } from "#lib/i18n/labels.js";
	import { INVITATION_EXPIRES_IN, type MemberRole } from "#lib/members.js";

	import {
		cancelInvitation,
		changeRole,
		getMembers,
		invite,
		removeMember,
		resendInvitation,
	} from "./members.remote.js";

	const data = $derived(await getMembers());

	const label = (role: string) => labelOrValue("memberRole", role);
	const inviteOptions = $derived(
		data.inviteRoles.map((role) => ({
			value: role,
			label: `${roleLabel("memberRole", role)}: ${roleLabel("memberRoleDescription", role)}`,
		})),
	);
</script>

<svelte:head>
	<title>{m.settings_members()} · {m.common_organization_settings()}</title>
</svelte:head>

<PageHeader title={m.settings_members()} description={data.name}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/settings")}
					>{m.common_organization_settings()}</Breadcrumb.Link
				>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.settings_members()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

{#if data.canManage}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_invite_title()}</Card.Title>
			<Card.Description>
				{m.settings_invite_description({
					organization: data.name,
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
					options={inviteOptions}
					class="md:flex-1"
				/>
				<Button type="submit" class="md:mt-6" disabled={!!invite.pending}>
					{#if invite.pending}
						<Spinner data-icon="inline-start" />
					{:else}
						<MailIcon data-icon="inline-start" />
					{/if}
					{m.settings_send_invitation()}
				</Button>
			</form>
			<Field.FieldError errors={invite.fields.issues()} class="mt-4" />
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_members()}</Card.Title>
		<Card.Description>
			{m.settings_people({ count: data.members.length, organization: data.name })}
			{data.canManage ? "" : m.settings_managers_change_this()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.settings_column_name()}</Table.Head>
					<Table.Head>{m.settings_column_role()}</Table.Head>
					<Table.Head>{m.settings_column_joined()}</Table.Head>
					{#if data.canManage}
						<Table.Head><span class="sr-only">{m.settings_column_actions()}</span></Table.Head>
					{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.members as member (member.id)}
					{@const change = changeRole.for(member.id)}
					<Table.Row data-member={member.email}>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="flex items-center gap-2 font-medium">
									{member.name}
									{#if member.isYou}
										<Badge variant="outline">{m.settings_you()}</Badge>
									{/if}
								</span>
								<span class="text-xs text-muted-foreground">{member.email}</span>
							</div>
						</Table.Cell>
						<Table.Cell>
							{#if member.roleOptions.length}
								<form
									{...change.enhance(async ({ submit }) => {
										if (await submit())
											toast.success(m.settings_role_changed({ name: member.name }));
									})}
									class="flex flex-col gap-1"
								>
									<input {...change.fields.memberId.as("hidden", member.id)} />
									<div class="flex items-center gap-2">
										<!-- Saves as soon as another role is chosen. -->
										<NativeSelect.Root
											aria-label={m.settings_role_of({ name: member.name })}
											size="sm"
											{...change.fields.role.as("select", member.roles[0] as MemberRole)}
											onchange={(event) => event.currentTarget.form?.requestSubmit()}
										>
											{#each member.roleOptions as role (role)}
												<NativeSelect.Option value={role}>{label(role)}</NativeSelect.Option>
											{/each}
										</NativeSelect.Root>
										{#if change.pending}
											<Spinner />
										{/if}
										<noscript>
											<Button type="submit" variant="outline" size="sm">{m.common_save()}</Button>
										</noscript>
									</div>
									<Field.FieldError errors={change.fields.allIssues()} />
								</form>
							{:else}
								<div class="flex gap-1">
									{#each member.roles as role (role)}
										<Badge variant={role === "member" ? "outline" : "secondary"}
											>{label(role)}</Badge
										>
									{/each}
								</div>
							{/if}
						</Table.Cell>
						<Table.Cell class="tabular-nums">{formatDate(member.joinedAt)}</Table.Cell>
						{#if data.canManage}
							<Table.Cell class="text-right">
								{#if member.canRemove}
									<DeleteDialog
										form={removeMember.for(member.id)}
										id={member.id}
										title={m.settings_remove_title({ name: member.name })}
										description={m.settings_remove_description({ organization: data.name })}
										label={m.settings_remove()}
									/>
								{/if}
							</Table.Cell>
						{/if}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

{#if data.canManage}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_pending()}</Card.Title>
			<Card.Description>{m.settings_pending_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.invitations.length}
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
						{#each data.invitations as invitation (invitation.id)}
							{@const resend = resendInvitation.for(invitation.id)}
							{@const cancel = cancelInvitation.for(invitation.id)}
							<Table.Row data-invitation={invitation.email}>
								<Table.Cell class="font-medium">{invitation.email}</Table.Cell>
								<Table.Cell>{label(invitation.role ?? "member")}</Table.Cell>
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
											<Button type="submit" variant="outline" size="sm" disabled={!!resend.pending}>
												{#if resend.pending}
													<Spinner data-icon="inline-start" />
												{/if}
												{m.settings_resend()}
											</Button>
										</form>
										<form
											{...cancel.enhance(async ({ submit }) => {
												if (await submit())
													toast.success(
														m.settings_invitation_cancelled({ email: invitation.email }),
													);
											})}
										>
											<input {...cancel.fields.id.as("hidden", invitation.id)} />
											<Button type="submit" variant="ghost" size="sm" disabled={!!cancel.pending}>
												{#if cancel.pending}
													<Spinner data-icon="inline-start" />
												{/if}
												{m.settings_cancel_invitation()}
											</Button>
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
{/if}
