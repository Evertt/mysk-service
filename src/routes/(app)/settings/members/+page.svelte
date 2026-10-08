<!--
	@component
	The organization's members and pending invitations. Owners and admins invite people, change roles
	and remove members; everyone else sees the list.
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

<svelte:head>
	<title>{m.settings_members()} · {m.common_organization_settings()}</title>
</svelte:head>

<PageHeader
	title={m.settings_members()}
	description={data.name}
	breadcrumbs={[
		{ label: m.common_organization_settings(), href: resolve("/(app)/settings") },
		{ label: m.settings_members() },
	]}
/>

{#if data.canManage}
	<InviteCard organization={data.name} roles={data.inviteRoles} />
{/if}

<MembersCard members={data.members} organization={data.name} canManage={data.canManage} />

{#if data.canManage}
	<InvitationsCard invitations={data.invitations} />
{/if}
