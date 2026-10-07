<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import XIcon from "@lucide/svelte/icons/x";

	import ActivityList from "#lib/components/activity/activity-list.svelte";
	import { getActivity, getActivityFilters } from "#lib/components/activity/activity.remote.js";
	import PageHeader from "#lib/components/page-header.svelte";

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
		if (!first) return { noun: filters.type, label: `#${filters.id}` };
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
	<title>Activity</title>
</svelte:head>

<PageHeader title="Activity" description="Who changed what in the organization, newest first." />

<Card.Root>
	<Card.Header>
		<form method="GET" class="flex flex-wrap items-end gap-3" aria-label="Filter activity">
			{#if filters.id}
				<input type="hidden" name="type" value={filters.type} />
				<input type="hidden" name="id" value={filters.id} />
			{:else}
				<Field.Field class="w-44">
					<Field.FieldLabel for="activity-type">Record type</Field.FieldLabel>
					<NativeSelect.Root
						id="activity-type"
						name="type"
						value={filters.type ?? ""}
						class="w-full"
					>
						<NativeSelect.Option value="">All types</NativeSelect.Option>
						{#each options.types as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<Field.Field class="w-44">
				<Field.FieldLabel for="activity-user">User</Field.FieldLabel>
				<NativeSelect.Root id="activity-user" name="user" value={filters.user ?? ""} class="w-full">
					<NativeSelect.Option value="">Everyone</NativeSelect.Option>
					{#each options.users as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field class="w-40">
				<Field.FieldLabel for="activity-from">From</Field.FieldLabel>
				<Input id="activity-from" type="date" name="from" value={filters.from ?? ""} />
			</Field.Field>
			<Field.Field class="w-40">
				<Field.FieldLabel for="activity-to">To</Field.FieldLabel>
				<Input id="activity-to" type="date" name="to" value={filters.to ?? ""} />
			</Field.Field>
			<div class="flex gap-2">
				<Button type="submit">Filter</Button>
				<Button variant="ghost" href={resolve("/(app)/activity")}>Reset</Button>
			</div>
		</form>
		{#if subject}
			<div class="flex flex-wrap items-center gap-2 pt-2 text-sm">
				<span class="text-muted-foreground">Only the {subject.noun}</span>
				<Badge variant="secondary">{subject.label}</Badge>
				<Button variant="ghost" size="sm" href={withParams({ type: null, id: null, before: null })}>
					<XIcon data-icon="inline-start" />
					Show everything
				</Button>
			</div>
		{/if}
	</Card.Header>
	<Card.Content>
		<ActivityList
			entries={feed.entries}
			empty={filters.before
				? "There's nothing older."
				: "Nothing matches these filters. Try a wider date range."}
		/>
	</Card.Content>
	{#if filters.before || feed.older}
		<Card.Footer class="flex justify-between gap-2">
			{#if filters.before}
				<Button variant="outline" size="sm" href={withParams({ before: null })}>
					<ArrowLeftIcon data-icon="inline-start" />
					Newest
				</Button>
			{:else}
				<span></span>
			{/if}
			{#if feed.older}
				<Button variant="outline" size="sm" href={withParams({ before: String(feed.older) })}>
					Older
					<ArrowRightIcon data-icon="inline-end" />
				</Button>
			{/if}
		</Card.Footer>
	{/if}
</Card.Root>
