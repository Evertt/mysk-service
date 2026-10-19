<!--
	@component
	The bell in a shell's header, with a dot while there are unread notifications, and its tray: the
	newest notifications by day (`#lib/server/notifications/`), each with its category's icon, the
	activity log's sentence and how long ago. Opening it marks what it shows as seen, up to the newest
	entry it shows (`markSeen`), so one that comes in while it's open stays unread; the entries that
	were unread when it opened stay highlighted. Each shell gives its own remote functions.
-->
<script lang="ts" generics="Entry extends NotificationEntry">
	import BellIcon from "@lucide/svelte/icons/bell";

	import { currentDay, getTimeZone } from "#lib/dates.ts";
	import { formatDate, formatTimeAgo } from "#lib/i18n/index.ts";
	import {
		byDay,
		notificationCategories,
		showsDot,
		unreadLabel,
	} from "#lib/notifications/display.ts";
	import type { SubjectLink } from "#lib/server/activity/index.ts";
	import type { NotificationEntry, UnreadNotifications } from "#lib/server/notifications/index.ts";
	import { cn } from "#lib/utils.ts";

	import ActivitySentence from "../activity/activity-sentence.svelte";

	let {
		unread,
		load,
		markSeen,
		empty,
		allHref,
		href,
		boundary,
	}: {
		/** The dot's count, as the shell's live query (or refreshed query) answers it. */
		unread: UnreadNotifications | undefined;
		/** The tray's entries, freshly read, and how far the user had read. */
		load: () => Promise<{ entries: Entry[]; lastSeen: number }>;
		/** Marks the notifications seen up to an entry's id. */
		markSeen: (upToId: number) => Promise<unknown>;
		/** What the empty tray says: what would show up here. */
		empty: string;
		/** The whole activity log, if the shell has it. */
		allHref?: string;
		/** Where an entry's subject links to, if not its office page. */
		href?: (entry: Entry, link: SubjectLink) => string | null;
		/**
		 * What the tray keeps within, if not the window: the engineer portal's screen in the desktop's
		 * phone frame.
		 */
		boundary?: () => Element | null;
	} = $props();

	let tray = $state<{ entries: Entry[]; lastSeen: number } | null>(null);
	/** The newest entry this page marked seen: the dot waits for a newer one. */
	let markedUpTo = $state(0);

	const dot = $derived(showsDot(unread, markedUpTo));
	const count = $derived(dot && unread ? unreadLabel(unread.count) : null);
	const days = $derived(tray ? byDay(tray.entries, getTimeZone()) : []);

	/**
	 * Reads the tray afresh and marks what it shows seen. What it showed last time goes first: its
	 * highlights were of then (and a test would read it for the new tray).
	 */
	async function opened() {
		tray = null;
		const read = await load();
		tray = read;
		const newest = read.entries[0]?.id;
		if (newest !== undefined && newest > Math.max(read.lastSeen, markedUpTo)) {
			markedUpTo = newest;
			await markSeen(newest);
		}
	}

	/** "Today", "Yesterday", or the date. */
	function dayLabel(day: Temporal.PlainDate) {
		const today = currentDay();
		if (day.equals(today)) return m.common_notifications_today();
		if (day.equals(today.subtract({ days: 1 }))) return m.common_notifications_yesterday();
		return formatDate(day);
	}
</script>

<Popover.Root
	onOpenChange={(open) => {
		if (open) void opened();
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				class="relative"
				aria-label={count
					? m.common_notifications_show_new({ count })
					: m.common_notifications_show()}
				data-notification-bell
			>
				<BellIcon />
				{#if dot}
					<span
						class="absolute top-1 right-1 size-2 rounded-full bg-destructive ring-2 ring-background"
						data-notification-dot={count}
						aria-hidden="true"
					></span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		collisionBoundary={boundary?.() ?? undefined}
		collisionPadding={8}
		class="w-96 max-w-(--bits-popover-content-available-width) gap-0 p-0"
	>
		<header class="flex items-center justify-between border-b px-4 py-3">
			<h2 class="text-sm font-medium">{m.common_notifications()}</h2>
			{#if allHref}
				<a href={allHref} class="text-xs text-muted-foreground underline-offset-4 hover:underline">
					{m.common_notifications_all_activity()}
				</a>
			{/if}
		</header>
		<div class="max-h-[min(28rem,70svh)] overflow-y-auto" data-notification-tray aria-busy={!tray}>
			{#if !tray}
				<div class="flex flex-col gap-3 p-4">
					<Skeleton class="h-10" />
					<Skeleton class="h-10" />
					<Skeleton class="h-10" />
				</div>
			{:else if !tray.entries.length}
				<Empty.Root class="p-6">
					<Empty.Header>
						<Empty.Title>{m.common_notifications_none()}</Empty.Title>
						<Empty.Description>{empty}</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#each days as group (group.day.toString())}
					<section>
						<h3
							class="sticky top-0 bg-popover px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground"
						>
							{dayLabel(group.day)}
						</h3>
						<ul class="flex flex-col">
							{#each group.entries as entry (entry.id)}
								{@const category = notificationCategories[entry.category]}
								<li
									class={cn("flex gap-3 px-4 py-2 text-sm", entry.unread && "bg-accent/60")}
									data-notification={entry.id}
									data-unread={entry.unread || undefined}
								>
									<span
										class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
										title={category.label()}
									>
										<category.icon class="size-3.5" aria-hidden="true" />
										<span class="sr-only">{category.label()}</span>
									</span>
									<div class="flex min-w-0 flex-col gap-0.5">
										<p class="break-words">
											<ActivitySentence
												{entry}
												href={href ? (link) => href(entry, link) : undefined}
											/>
										</p>
										{#if entry.changes.length}
											<p class="truncate text-xs text-muted-foreground">
												{entry.changes
													.map((change) =>
														change.summary
															? `${change.field}: ${change.summary}`
															: `${change.field}: ${change.before} → ${change.after}`,
													)
													.join(" · ")}
											</p>
										{/if}
										<time
											datetime={entry.at.toString()}
											class="text-xs text-muted-foreground tabular-nums"
										>
											{formatTimeAgo(entry.at)}
											{#if entry.unread}
												<span class="sr-only">· {m.common_notifications_unread()}</span>
											{/if}
										</time>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
