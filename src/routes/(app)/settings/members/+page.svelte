<!--
	@component
	The organization's members and pending invitations, for owners and admins, who invite people,
	change roles and remove members.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import InvitationsCard from "./invitations-card.svelte";
	import InviteCard from "./invite-card.svelte";
	import MembersCard from "./members-card.svelte";
	import { getMembers } from "./members.remote.ts";

	const data = $derived(await getMembers());
</script>

<PageHeader
	title={m.settings_members()}
	description={data.name}
	breadcrumbs={[
		{ label: m.common_organization_settings(), href: resolve("/(app)/settings") },
		{ label: m.settings_members() },
	]}
/>

<InviteCard organization={data.name} roles={data.inviteRoles} />

<MembersCard members={data.members} organization={data.name} />

<InvitationsCard invitations={data.invitations} />
