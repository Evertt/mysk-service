<!--
	@component
	The organization's members. Owners and admins (`canManage`) also change roles, which saves as
	soon as another is chosen, and remove members.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import type { MemberRole } from "#lib/auth";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import { formatDate, labelOrValue } from "#lib/i18n";

	import { changeRole, getMembers, removeMember } from "./members.remote.ts";

	type Member = Awaited<ReturnType<typeof getMembers>>["members"][number];

	let {
		members,
		organization,
		canManage,
	}: { members: Member[]; organization: string; canManage: boolean } = $props();

	const label = (role: string) => labelOrValue("memberRole", role);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.settings_members()}</Card.Title>
		<Card.Description>
			{m.settings_people({ count: members.length, organization })}
			{canManage ? "" : m.settings_managers_change_this()}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.settings_column_name()}</Table.Head>
					<Table.Head>{m.settings_column_role()}</Table.Head>
					<Table.Head>{m.settings_column_joined()}</Table.Head>
					{#if canManage}
						<Table.Head><span class="sr-only">{m.settings_column_actions()}</span></Table.Head>
					{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each members as member (member.id)}
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
						{#if canManage}
							<Table.Cell class="text-right">
								{#if member.canRemove}
									<DeleteDialog
										form={removeMember.for(member.id)}
										id={member.id}
										title={m.settings_remove_title({ name: member.name })}
										description={m.settings_remove_description({ organization })}
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
