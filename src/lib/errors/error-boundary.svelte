<!--
	@component
	A part of a page that fails on its own (a module's slot contribution, the activity card): when
	what's inside throws while rendering, the page around it carries on, and the part shows a small
	card saying so, with Try again (or the `failed` snippet's own look).

	- Every error is logged to the console and reported to the server (`report()`), under `name`.
	- By its kind (`classify()`): an `unknown` one resets the part once by itself, with a toast; if
	  it fails again within 30 s (`AUTO_RESET_WINDOW_MS`, per page), the card stays. An `offline` one
	  tries again once the browser is back online. The others (a refusal, a new version, a signed-out
	  session) show the card at once.
	- A failure doesn't outlive its page: navigating elsewhere (the same component on another page,
	  e.g. another order) tries again.

	A page's own failures are the `+error` pages' (`src/routes/error-view.svelte`): SvelteKit wraps
	every page in a boundary of its own, inside the layouts, which catches them first.
-->
<script lang="ts">
	import { browser } from "$app/env";
	import { afterNavigate } from "$app/navigation";
	import { page, updated } from "$app/state";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import type { Snippet } from "svelte";
	import { toast } from "svelte-sonner";
	import { on } from "svelte/events";

	import { AutoResets } from "./auto-reset.ts";
	import { classify, type ErrorKind } from "./classify.ts";
	import { describeError } from "./messages.ts";
	import { report } from "./report.ts";

	let {
		name,
		children,
		pending,
		failed: failedView,
	}: {
		/** What the part is, for the logs and reports, e.g. `activity`, `part:<contribution id>`. */
		name: string;
		children: Snippet;
		/**
		 * What shows while what's inside first awaits, as a boundary's `pending` (in this boundary:
		 * another one inside, with a `pending` of its own, kept the page from hydrating in Svelte 5.57).
		 */
		pending?: Snippet;
		/** The part's own look once it failed, with `retry` to render it anew. */
		failed?: Snippet<[failure: { error: unknown; kind: ErrorKind; retry: () => void }]>;
	} = $props();

	const autoResets = new AutoResets();

	/** The shown failure's `reset`, and the page it failed on. */
	let failure: { reset: () => void; path: string } | undefined;
	/** Stops waiting for the browser to be online again. */
	let stopWaiting: (() => void) | undefined;

	const kindOf = (error: unknown) =>
		classify(error, { online: browser ? navigator.onLine : true, updated: updated.current });

	/** Renders the part anew, if it failed (with `reset`, that failure's). */
	function retry(reset = failure?.reset) {
		failure = undefined;
		stopWaiting?.();
		stopWaiting = undefined;
		reset?.();
	}

	function onerror(error: unknown, reset: () => void) {
		console.error(`${name} failed`, error);
		report(error, { source: `boundary:${name}` });
		const path = page.url.pathname;
		failure = { reset, path };
		const kind = kindOf(error);
		if (kind === "unknown" && autoResets.allow(path)) {
			toast.info(m.common_error_reset_toast());
			// Not while the boundary is still handling the error, which Svelte refuses.
			queueMicrotask(() => retry());
		} else if (kind === "offline") {
			stopWaiting = on(window, "online", () => retry());
		}
	}

	afterNavigate(() => {
		if (failure && failure.path !== page.url.pathname) retry();
	});
</script>

<svelte:boundary {onerror} {pending}>
	{@render children()}

	{#snippet failed(error, reset)}
		{@const kind = kindOf(error)}
		{@const again = () => retry(reset)}
		{#if failedView}
			{@render failedView({ error, kind, retry: again })}
		{:else}
			<Card.Root size="sm" data-error-boundary={name} data-error-kind={kind}>
				<Card.Content class="flex-row items-center gap-3 text-muted-foreground">
					<TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
					<p class="flex-1">
						{kind === "unknown" ? m.common_error_part() : describeError(error, kind).text}
					</p>
					<Button variant="outline" size="sm" onclick={again}>{m.common_try_again()}</Button>
				</Card.Content>
			</Card.Root>
		{/if}
	{/snippet}
</svelte:boundary>
