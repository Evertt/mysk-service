<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import { ActiveBadge, EngineerWork, ProfileCard } from "#lib/engineers/components.ts";
	import { points } from "#lib/engineers/extensions.ts";
	import { engineerSpecialtyDisplay, regionLabel } from "#lib/engineers/index.ts";
	import { deleteEngineer, getEngineer } from "#lib/engineers/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const engineer = $derived((await getEngineer(params.id)).engineer);
</script>

<RecordPage
	title={engineer.name}
	subtitle={m.engineers_region_description({ region: regionLabel(engineer.region) })}
	list={{ label: m.engineers_title(), href: resolve("/(app)/engineers") }}
	edit={resolve("/(app)/engineers/[id]/edit", { id: String(engineer.id) })}
	remove={{
		form: deleteEngineer,
		id: String(engineer.id),
		title: m.engineers_delete_title({ name: engineer.name }),
		description: m.engineers_delete_description(),
	}}
	subject={{ type: "engineer", id: engineer.id }}
	slots={points.detail}
	slotProps={{ id: engineer.id }}
>
	{#snippet badges()}
		<ActiveBadge active={engineer.active} />
		<EnumBadge display={engineerSpecialtyDisplay} value={engineer.specialty} />
	{/snippet}

	{#snippet main()}
		<EngineerWork {engineer} />
	{/snippet}

	{#snippet side()}
		<ProfileCard {engineer} />
	{/snippet}
</RecordPage>
