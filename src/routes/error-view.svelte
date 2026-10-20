<!--
	@component
	The content of the error pages (the root's and each shell's `+error.svelte`), which show what
	went wrong with a page: one that didn't load (a 404, a 403), and one that threw while rendering
	(SvelteKit wraps each page in a boundary of its own, with the nearest `+error` page as its
	failure). By the error's kind (`classify()`): its message, the id to quote for an unknown one,
	and the ways on: Try again, Reload, Back, the shell's home, or Sign in.

	Like a part's boundary (`ErrorBoundary`), it tries again once by itself after an unknown error,
	with a toast, unless the page failed so within the last 30 s (`AUTO_RESET_WINDOW_MS`), and once
	the browser is back online after an offline one. Trying again navigates to the page anew, which
	resets SvelteKit's boundary.

	The pages set the title themselves (a `<svelte:head>` in here breaks hydration of the root error
	page).
-->
<script lang="ts" module>
	import { AutoResets } from "#lib/errors/auto-reset.ts";

	/** The automatic retries of every error page together: each error makes a new one. */
	const autoResets = new AutoResets();
</script>

<script lang="ts">
	import { browser } from "$app/env";
	import { goto } from "$app/navigation";
	import { page, updated } from "$app/state";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WifiOffIcon from "@lucide/svelte/icons/wifi-off";
	import { onMount, untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { on } from "svelte/events";

	import { loginUrl } from "#lib/auth/index.ts";
	import { classify } from "#lib/errors/classify.ts";
	import { describeError } from "#lib/errors/messages.ts";

	let {
		home,
		homeLabel,
		size = "default",
	}: {
		/** Where the shell's home is: the dashboard, `/my` or `/portal`. */
		home: string;
		homeLabel: string;
		/** The buttons' size: `lg` in the portals, made for a phone. */
		size?: "default" | "lg";
	} = $props();

	const error = $derived(page.error ?? { status: page.status, message: "" });
	const kind = $derived(
		classify(error, { online: browser ? navigator.onLine : true, updated: updated.current }),
	);
	const described = $derived(describeError(error, kind));

	/** Whether there's a page to go back to (known once mounted). */
	let canGoBack = $state(false);
	onMount(() => {
		canGoBack = history.length > 1;
	});

	/** Loads the page anew, in place, with its data and queries. */
	const retry = () => goto(location.href, { replace: true, reset: false, refreshAll: true });

	// Once per error: the page's own error, as SvelteKit keeps it.
	$effect(() => {
		if (kind === "offline") return on(window, "online", () => void retry());
		if (kind === "unknown" && untrack(() => autoResets.allow(page.url.pathname))) {
			toast.info(m.common_error_reset_toast());
			void retry();
		}
	});

	const signIn = $derived(loginUrl(page.url.pathname + page.url.search));
</script>

<Empty.Root data-error-kind={kind}>
	<Empty.Header>
		<Empty.Media variant="icon">
			{#if kind === "http" && page.status === 404}
				<SearchXIcon />
			{:else if kind === "session"}
				<LogInIcon />
			{:else if kind === "offline"}
				<WifiOffIcon />
			{:else if kind === "updated"}
				<RefreshCwIcon />
			{:else}
				<TriangleAlertIcon />
			{/if}
		</Empty.Media>
		<Empty.Title>{described.title}</Empty.Title>
		<Empty.Description>{described.text}</Empty.Description>
		{#if kind === "unknown" && page.error?.errorId}
			<p class="text-xs text-muted-foreground">
				{m.common_error_id()}
				<code data-error-id class="font-mono select-all">{page.error.errorId}</code>
			</p>
		{/if}
	</Empty.Header>
	<Empty.Content class="flex-row flex-wrap justify-center gap-2">
		{#if kind === "session"}
			<Button href={signIn} {size}>{m.common_sign_in()}</Button>
		{:else if kind === "unknown" || kind === "offline"}
			<Button onclick={retry} {size}>{m.common_try_again()}</Button>
		{/if}
		{#if kind !== "session"}
			<Button
				variant={kind === "updated" ? "default" : "outline"}
				onclick={() => location.reload()}
				{size}
			>
				{m.common_reload()}
			</Button>
		{/if}
		{#if canGoBack}
			<Button variant="outline" onclick={() => history.back()} {size}>{m.common_back()}</Button>
		{/if}
		<Button variant="outline" href={home} {size}>{homeLabel}</Button>
	</Empty.Content>
</Empty.Root>
