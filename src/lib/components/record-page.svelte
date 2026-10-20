<!--
	@component
	The one way to lay out a record's page (an order, a customer, a contract): its header, with the
	trail to it (`list`, then the record), `badges`, `actions` and the Edit and Delete buttons
	(`edit`, `remove`); the notice that someone else changed it (`<ChangedElsewhere>`, for the
	types in `watchedTypes`); `summary` (key figures) above the two columns, `main` (two thirds) and
	`side`; the modules' cards in each column after the page's own (`slots`, the record's
	`points.detail` from `defineRecordPoints()`, given `slotProps`); and its "Activity" card last.

	`layout="masonry"` packs `main` (two columns wide) and `side`'s cards together instead
	(`#lib/components/masonry.ts`): a unit's page. `printMain` prints the main column alone, the
	page's document (an invoice).
-->
<script lang="ts" generics="Props extends Record<string, unknown>">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import type { ComponentProps, Snippet } from "svelte";

	import type { LoggedType } from "#lib/activity/index.ts";
	import type { RecordPoints } from "#lib/extensions/define.ts";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";

	import ActivityCard from "./activity/activity-card.svelte";
	import ChangedElsewhere from "./activity/changed-elsewhere.svelte";
	import { isWatched } from "./activity/watched.ts";
	import DeleteDialog from "./form/delete-dialog.svelte";
	import { masonry, masonryGrid } from "./masonry.ts";
	import PageHeader, { type Crumb } from "./page-header.svelte";

	let {
		title,
		subtitle,
		list,
		crumb = title,
		documentTitle,
		badges,
		actions: buttons,
		edit,
		remove,
		subject,
		slots,
		slotProps,
		summary,
		main,
		side,
		layout = "columns",
		printMain = false,
	}: {
		title: string;
		subtitle?: string;
		/** The trail to the record: its list, and what it's in (a location's customer). */
		list: Crumb | Crumb[];
		/** The record in the trail, if not its title (a unit's serial number). */
		crumb?: string;
		/** The browser tab's title, if not the title and the trail's nearest page. */
		documentTitle?: string;
		/** Next to the title, e.g. its status. */
		badges?: Snippet;
		/** The header's buttons before Edit and Delete, e.g. Print. */
		actions?: Snippet;
		/** The edit page's address, for the Edit button: none, no button. */
		edit?: string;
		/** The Delete button's dialog: none, no button. */
		remove?: ComponentProps<typeof DeleteDialog>;
		/** The record's activity subject: its "Activity" card, and the notice of changes elsewhere. */
		subject: { type: LoggedType; id: number };
		/** Above the columns: key figures. */
		summary?: Snippet;
		main: Snippet;
		side?: Snippet;
		layout?: "columns" | "masonry";
		/** Prints the main column alone, without the header and the side column. */
		printMain?: boolean;
	} & (
		| {
				/** The modules' cards in each column: the record's `points.detail`. */
				slots: RecordPoints<Props, unknown>["detail"];
				slotProps: Props;
		  }
		| { slots?: undefined; slotProps?: undefined }
	) = $props();

	const trail = $derived([...[list].flat(), { label: crumb }]);
</script>

{#snippet moduleCards(column: "main" | "side")}
	{#if slots && slotProps}
		<ExtensionSlot point={slots[column]} props={slotProps} />
	{/if}
{/snippet}

<div class={["contents", printMain && "print:hidden"]}>
	<PageHeader {title} description={subtitle} breadcrumbs={trail} {documentTitle} {badges}>
		{#snippet actions()}
			{@render buttons?.()}
			{#if edit}
				<Button variant="outline" href={edit}>
					<PencilIcon data-icon="inline-start" />
					{m.common_edit()}
				</Button>
			{/if}
			{#if remove}
				<DeleteDialog {...remove} />
			{/if}
		{/snippet}
	</PageHeader>
</div>

{#if isWatched(subject.type)}
	<ChangedElsewhere type={subject.type} id={subject.id} />
{/if}

{@render summary?.()}

{#if layout === "masonry"}
	<!-- Columns at least 17rem wide (a card's header with a button still fits), three at most, by
		the page's width rather than the window's (the sidebar takes 16rem of it): one on a phone and
		next to the sidebar on a tablet, two on a small laptop, three on a laptop. The slots' wrappers
		are `display: contents`, so each of the modules' cards is placed on its own. -->
	<div
		class={[
			masonryGrid,
			"grid-cols-[repeat(auto-fill,minmax(min(100%,max(17rem,calc((100%_-_3rem)/3))),1fr))] gap-6",
		]}
		data-record-cards
		{@attach masonry}
	>
		<div class="min-w-0" data-wide>
			{@render main()}
		</div>
		{@render side?.()}
		{@render moduleCards("main")}
		{@render moduleCards("side")}
		<ActivityCard type={subject.type} id={subject.id} />
	</div>
{:else}
	<div class="grid items-start gap-6 lg:grid-cols-3" data-record-columns>
		<div class={["flex min-w-0 flex-col gap-6 lg:col-span-2", printMain && "print:col-span-3"]}>
			{@render main()}
			{@render moduleCards("main")}
		</div>
		<div class={["flex min-w-0 flex-col gap-6", printMain && "print:hidden"]}>
			{@render side?.()}
			{@render moduleCards("side")}
			<ActivityCard type={subject.type} id={subject.id} />
		</div>
	</div>
{/if}
