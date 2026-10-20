<!--
	@component
	A table's saved views (see `views.ts`): the user's own and those shared with the organization,
	one click away, with the one the table shows checked. Saves the current view under a name, and
	changes the view the table is on: the checked one, or the one last opened if the table has
	changed since (to update it with the change), which the button shows as having unsaved changes.
	The view last opened is kept with the table's memory (see `table-memory.svelte.ts`), so it and
	its changes are still there when the user comes back; "No view" goes back to the table's
	defaults, and forgets it.
-->
<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import BookmarkXIcon from "@lucide/svelte/icons/bookmark-x";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import UserXIcon from "@lucide/svelte/icons/user-x";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { toast } from "svelte-sonner";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { errorMessage } from "#lib/utils.ts";

	import RenameViewDialog from "./rename-view-dialog.svelte";
	import SaveViewDialog from "./save-view-dialog.svelte";
	import type { TableUrlSync } from "./url-sync.svelte.ts";
	import {
		deleteView,
		getTableViews,
		shareView,
		type TableView,
		updateView,
	} from "./views.remote.ts";
	import { matchingViews, viewState } from "./views.ts";

	let { sync }: { sync: TableUrlSync } = $props();

	const data = $derived(await getTableViews(sync.viewsKey));
	const mine = $derived(data.views.filter((view) => view.mine));
	const others = $derived(data.views.filter((view) => !view.mine));

	/** What a view would save now. */
	const query = $derived(sync.viewQuery());
	const columns = $derived(sync.columns());
	const matching = $derived(matchingViews(data.views, sync.state(), sync.spec, columns));

	/** The view the table shows: the one opened last if it still matches, else one of the user's. */
	const active = $derived(
		matching.find((view) => view.id === sync.viewId) ??
			matching.find((view) => view.mine) ??
			matching[0],
	);
	/** The view the actions are about: the one shown, or the one opened last, changed since. */
	const current = $derived(active ?? data.views.find((view) => view.id === sync.viewId));

	function open(view: TableView) {
		sync.viewId = view.id;
		// A view saved before views had columns leaves them as they are.
		sync.show(viewState(view.query, sync.spec), view.columns ?? undefined);
	}

	/** Back to the table's defaults, forgetting the view. */
	function clear() {
		sync.viewId = undefined;
		sync.show(viewState("", sync.spec), null);
	}

	let saving = $state(false);
	let renaming = $state(false);
	let deleting = $state(false);
	/** A command under way. */
	let busy = $state(false);

	/** Runs a command on the current view, then says it's done, or why it failed. */
	async function run(action: () => Promise<unknown>, done: string) {
		busy = true;
		try {
			await action();
			toast.success(done);
			return true;
		} catch (error) {
			toast.error(errorMessage(error, m.common_error_generic()));
			return false;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet list(views: TableView[], label: string)}
	<DropdownMenu.Group>
		<DropdownMenu.Label>{label}</DropdownMenu.Label>
		<DropdownMenu.RadioGroup value={active ? String(active.id) : ""}>
			{#each views as view (view.id)}
				<DropdownMenu.RadioItem value={String(view.id)} closeOnSelect onSelect={() => open(view)}>
					<span class="flex min-w-0 flex-col">
						<span class="truncate">{view.name}</span>
						{#if view.owner}
							<span class="truncate text-xs text-muted-foreground">
								{m.common_views_shared_by({ name: view.owner })}
							</span>
						{/if}
					</span>
					{#if view.shared && view.mine}
						<UsersIcon
							class="ml-auto text-muted-foreground"
							aria-label={m.common_views_shared_hint()}
						/>
					{/if}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Group>
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="sm"
				aria-label={active
					? m.common_views_menu_active({ name: active.name })
					: current
						? m.common_views_menu_edited({ name: current.name })
						: undefined}
			>
				<BookmarkIcon data-icon="inline-start" />
				<span class="max-w-40 truncate">{current?.name ?? m.common_views_menu()}</span>
				{#if current && !active}
					<span
						class="size-1.5 shrink-0 rounded-full bg-primary"
						title={m.common_views_edited()}
						data-testid="views-edited"
					></span>
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-64">
		{#if mine.length}
			{@render list(mine, m.common_views_mine())}
		{/if}
		{#if others.length}
			{#if mine.length}<DropdownMenu.Separator />{/if}
			{@render list(others, m.common_views_shared())}
		{/if}
		{#if !data.views.length}
			<p class="px-2 py-1.5 text-sm text-muted-foreground">{m.common_views_none()}</p>
		{/if}
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => (saving = true)}>
			<PlusIcon />
			{m.common_views_save()}
		</DropdownMenu.Item>
		{#if current}
			<DropdownMenu.Item onSelect={clear}>
				<BookmarkXIcon />
				{m.common_views_clear()}
			</DropdownMenu.Item>
		{/if}
		{#if current?.editable}
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.Label class="truncate">{current.name}</DropdownMenu.Label>
				<DropdownMenu.Item
					disabled={current === active || busy}
					onSelect={() =>
						run(
							() => updateView({ id: current.id, query, columns: columns.current }),
							m.common_views_updated(),
						)}
				>
					<RefreshCwIcon />
					{m.common_views_update()}
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => (renaming = true)}>
					<PencilIcon />
					{m.common_views_rename()}
				</DropdownMenu.Item>
				{#if data.canShare}
					{#if current.shared}
						<DropdownMenu.Item
							disabled={busy}
							onSelect={() =>
								run(
									() => shareView({ id: current.id, shared: false }),
									m.common_views_unshared_done(),
								)}
						>
							<UserXIcon />
							{m.common_views_unshare()}
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item
							disabled={busy}
							onSelect={() =>
								run(
									() => shareView({ id: current.id, shared: true }),
									m.common_views_shared_done(),
								)}
						>
							<UsersIcon />
							{m.common_views_share()}
						</DropdownMenu.Item>
					{/if}
				{/if}
				<DropdownMenu.Item variant="destructive" onSelect={() => (deleting = true)}>
					<Trash2Icon />
					{m.common_views_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<SaveViewDialog
	bind:open={saving}
	tableKey={sync.viewsKey}
	{query}
	columns={columns.current}
	canShare={data.canShare}
	onsaved={(id) => (sync.viewId = id)}
/>

{#if current}
	{@const view = current}
	<RenameViewDialog bind:open={renaming} {view} />
	<!-- A view is deleted by a command, not a form. -->
	<ConfirmDialog
		title={m.common_views_delete_title({ name: view.name })}
		description={view.shared
			? m.common_views_delete_shared_description()
			: m.common_views_delete_description()}
		confirmLabel={m.common_delete()}
		destructive
		onconfirm={() => deleteView(view.id)}
		ondone={() => {
			if (sync.viewId === view.id) sync.viewId = undefined;
		}}
		done={m.common_views_deleted()}
		bind:open={deleting}
	/>
{/if}
