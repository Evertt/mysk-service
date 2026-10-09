<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import XIcon from "@lucide/svelte/icons/x";

	import { subjectNoun, subjectTypes } from "#lib/activity.ts";
	import ActivityList from "#lib/components/activity/activity-list.svelte";
	import { getActivity, getActivityFilters } from "#lib/components/activity/activity.remote.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { modules } from "#lib/modules/manifests.ts";

	const allModules = modules.map((module) => module.id);

	/** The filters in the URL, without empty or malformed ones. */
	const filters = $derived.by(() => {
		const params = page.url.searchParams;
		const text = (name: string) => params.get(name) || undefined;
		const day = (name: string) => {
			const value = params.get(name);
			return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
		};
		const before = Number(params.get("before"));
		return {
			type: text("type"),
			id: text("type") ? text("id") : undefined,
			user: text("user"),
			from: day("from"),
			to: day("to"),
			before: Number.isSafeInteger(before) && before > 0 ? before : undefined,
		};
	});

	const [feed, options] = $derived(await Promise.all([getActivity(filters), getActivityFilters()]));

	/** The record the feed is narrowed to, as its entries name it. */
	const subject = $derived.by(() => {
		if (!filters.id) return undefined;
		const first = feed.entries[0];
		if (!first) {
			const type = filters.type ?? "";
			return { noun: subjectNoun(type, subjectTypes(allModules)[type]), label: `#${filters.id}` };
		}
		return first.parent && first.parent.noun !== first.subject.noun ? first.parent : first.subject;
	});

	/** This page's URL with some parameters changed (`null` removes one). */
	const withParams = (changes: Record<string, string | null>) => {
		const params = new URLSearchParams(page.url.search);
		for (const [name, value] of Object.entries(changes)) {
			if (value === null) params.delete(name);
			else params.set(name, value);
		}
		const query = params.toString();
		return `${resolve("/(app)/activity")}${query ? `?${query}` : ""}`;
	};
</script>

<svelte:head>
	<title>{m.activity_title()}</title>
</svelte:head>

<PageHeader title={m.activity_title()} description={m.activity_description()} />

<Card.Root>
	<Card.Header>
		<form
			method="GET"
			class="flex flex-wrap items-end gap-3"
			aria-label={m.activity_filter_label()}
		>
			{#if filters.id}
				<input type="hidden" name="type" value={filters.type} />
				<input type="hidden" name="id" value={filters.id} />
			{:else}
				<Field.Field class="w-44">
					<Field.FieldLabel for="activity-type">{m.activity_filter_type()}</Field.FieldLabel>
					<NativeSelect.Root
						id="activity-type"
						name="type"
						value={filters.type ?? ""}
						class="w-full"
					>
						<NativeSelect.Option value="">{m.activity_filter_all_types()}</NativeSelect.Option>
						{#each options.types as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<Field.Field class="w-44">
				<Field.FieldLabel for="activity-user">{m.activity_filter_user()}</Field.FieldLabel>
				<NativeSelect.Root id="activity-user" name="user" value={filters.user ?? ""} class="w-full">
					<NativeSelect.Option value="">{m.activity_filter_everyone()}</NativeSelect.Option>
					{#each options.users as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field class="w-40">
				<Field.FieldLabel for="activity-from">{m.activity_filter_from()}</Field.FieldLabel>
				<Input id="activity-from" type="date" name="from" value={filters.from ?? ""} />
			</Field.Field>
			<Field.Field class="w-40">
				<Field.FieldLabel for="activity-to">{m.activity_filter_to()}</Field.FieldLabel>
				<Input id="activity-to" type="date" name="to" value={filters.to ?? ""} />
			</Field.Field>
			<div class="flex gap-2">
				<Button type="submit">{m.activity_filter()}</Button>
				<Button variant="ghost" href={resolve("/(app)/activity")}
					>{m.activity_filter_reset()}</Button
				>
			</div>
		</form>
		{#if subject}
			<div class="flex flex-wrap items-center gap-2 pt-2 text-sm">
				<span class="text-muted-foreground">{m.activity_only_subject({ noun: subject.noun })}</span>
				<Badge variant="secondary">{subject.label}</Badge>
				<Button variant="ghost" size="sm" href={withParams({ type: null, id: null, before: null })}>
					<XIcon data-icon="inline-start" />
					{m.activity_show_everything()}
				</Button>
			</div>
		{/if}
	</Card.Header>
	<Card.Content>
		<ActivityList
			entries={feed.entries}
			empty={filters.before ? m.activity_nothing_older() : m.activity_nothing_matches()}
		/>
	</Card.Content>
	{#if filters.before || feed.older}
		<Card.Footer class="flex justify-between gap-2">
			{#if filters.before}
				<Button variant="outline" size="sm" href={withParams({ before: null })}>
					<ArrowLeftIcon data-icon="inline-start" />
					{m.activity_newest()}
				</Button>
			{:else}
				<span></span>
			{/if}
			{#if feed.older}
				<Button variant="outline" size="sm" href={withParams({ before: String(feed.older) })}>
					{m.activity_older()}
					<ArrowRightIcon data-icon="inline-end" />
				</Button>
			{/if}
		</Card.Footer>
	{/if}
</Card.Root>
