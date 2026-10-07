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
	import { formatDate } from "#lib/format.js";
	import { label as roleLabel, labelOrValue } from "#lib/i18n/labels.js";
	import type { MemberRole } from "#lib/members.js";

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
	<title>Members · Organization settings</title>
</svelte:head>

<PageHeader title="Members" description={data.name}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/settings")}>Organization settings</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Members</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

{#if data.canManage}
	<Card.Root>
		<Card.Header>
			<Card.Title>Invite someone</Card.Title>
			<Card.Description>
				They get an email with a link to join {data.name}, which works for 7 days.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				{...invite.enhance(async ({ element, submit }) => {
					if (!(await submit())) return;
					toast.success(`Invitation sent to ${invite.result?.email}`);
					element.reset();
				})}
				class="flex flex-col gap-4 md:flex-row md:items-start"
				novalidate
			>
				<TextField
					field={invite.fields.email}
					label="Email"
					type="email"
					placeholder="name@example.com"
					autocomplete="off"
					class="md:flex-1"
				/>
				<SelectField
					field={invite.fields.role}
					label="Role"
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
					Send invitation
				</Button>
			</form>
			<Field.FieldError errors={invite.fields.issues()} class="mt-4" />
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>Members</Card.Title>
		<Card.Description>
			{data.members.length === 1 ? "1 person" : `${data.members.length} people`} can sign in to
			{data.name}.{data.canManage ? "" : " Owners and admins can change this."}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>Joined</Table.Head>
					{#if data.canManage}
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
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
										<Badge variant="outline">You</Badge>
									{/if}
								</span>
								<span class="text-xs text-muted-foreground">{member.email}</span>
							</div>
						</Table.Cell>
						<Table.Cell>
							{#if member.roleOptions.length}
								<form
									{...change.enhance(async ({ submit }) => {
										if (await submit()) toast.success(`${member.name}'s role changed`);
									})}
									class="flex flex-col gap-1"
								>
									<input {...change.fields.memberId.as("hidden", member.id)} />
									<div class="flex items-center gap-2">
										<!-- Saves as soon as another role is chosen. -->
										<NativeSelect.Root
											aria-label="Role of {member.name}"
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
											<Button type="submit" variant="outline" size="sm">Save</Button>
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
										title="Remove {member.name}?"
										description="They can no longer sign in to {data.name}. What they did in it stays. To bring them back, invite them again."
										label="Remove"
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
			<Card.Title>Pending invitations</Card.Title>
			<Card.Description>Invitations that haven't been accepted yet.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.invitations.length}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Email</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Invited</Table.Head>
							<Table.Head>Expires</Table.Head>
							<Table.Head><span class="sr-only">Actions</span></Table.Head>
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
											<span class="text-xs text-muted-foreground">by {invitation.invitedBy}</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell>
									{#if invitation.expired}
										<Badge variant="destructive">Expired</Badge>
									{:else}
										<span class="tabular-nums">{formatDate(invitation.expiresAt)}</span>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<div class="flex justify-end gap-2">
										<form
											{...resend.enhance(async ({ submit }) => {
												if (await submit())
													toast.success(`Invitation sent to ${invitation.email} again`);
											})}
										>
											<input {...resend.fields.id.as("hidden", invitation.id)} />
											<Button type="submit" variant="outline" size="sm" disabled={!!resend.pending}>
												{#if resend.pending}
													<Spinner data-icon="inline-start" />
												{/if}
												Resend
											</Button>
										</form>
										<form
											{...cancel.enhance(async ({ submit }) => {
												if (await submit())
													toast.success(`Invitation to ${invitation.email} cancelled`);
											})}
										>
											<input {...cancel.fields.id.as("hidden", invitation.id)} />
											<Button type="submit" variant="ghost" size="sm" disabled={!!cancel.pending}>
												{#if cancel.pending}
													<Spinner data-icon="inline-start" />
												{/if}
												Cancel
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
				<p class="text-sm text-muted-foreground">No pending invitations.</p>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
