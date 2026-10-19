<!--
	@component
	A link to a record's page, as the record link components render it (`OrderLink`, `CustomerLink`,
	`EquipmentLink`, `EngineerLink`): `children` inside an anchor with `class`. With `secondary` (a
	string, or `null` for none), it's a table cell's two lines: the link, and a muted line below it
	(`TwoLineCell`'s layout).

	With `load` and `preview`, resting the pointer on the link shows a hover card of the record (see
	`previews.ts` for when): `load` asks for the record (its batch query, which the record's page
	reads too) and `preview` renders what it answered.

	**One request for a hover and a click.** SvelteKit preloads the page of a link the pointer rests
	on (20 ms after it stopped moving), rendering it in a fork (`forkPreloads`), which asks for the
	page's queries, the record's among them. The card has to share that request, but a query first
	asked for in the fork is the fork's until the click commits it: read outside it, it hadn't
	resolved ("Query resolved without a value"). So the link asks for the record itself, a little
	before SvelteKit does (`restDelay`): the query is then the page's, and the fork, the card and the
	page after the click all read that one answer. It's the request the preload would have made, so
	resting on a link costs no more than it did; a pointer passing over the link asks for nothing.
-->
<script lang="ts" generics="T">
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import TwoLineCell from "../data-table/two-line-cell.svelte";
	import PreviewContent from "./preview-content.svelte";
	import {
		closeDelay,
		finePointer,
		openDelay,
		recordPreviewsShown,
		restDelay,
	} from "./previews.ts";

	let {
		href,
		class: className,
		secondary,
		load,
		preview,
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "class" | "children"> & {
		href: string;
		/** The anchor's classes (in two lines, the cell's own). */
		class: string;
		/** A line below the link, as in a table cell; `null` for the layout without one. */
		secondary?: string | null;
		/** Asks for the record, for its hover card: its batch query, e.g. `getOrder(number)`. */
		load?: () => PromiseLike<T>;
		/** The record's hover card's content, given what `load` answered. */
		preview?: Snippet<[T]>;
		children: Snippet;
	} = $props();

	const shown = recordPreviewsShown();

	/** The record's query, asked for once the pointer rested on the link, until the card closes. */
	let asked: PromiseLike<T> | undefined;
	let open = $state(false);

	/** The record's query, asked for now (outside any fork, see above). */
	function ask() {
		const query = load!();
		// Starts the request; the card reads its answer.
		query.then(undefined, () => {});
		return query;
	}

	/** The card's element's id, for telling whether the pointer is on it. */
	const contentId = $props.id();

	/**
	 * Watches the pointer on the link: asks for the record when the pointer comes to rest on it (see
	 * above), and closes the open card when the pointer is on neither the link nor the card. The
	 * card closes itself too (its safe polygon), but a card that opened while a preload fork was
	 * pending may not run its effects (docs/upstream-bugs/README.md, 8), and stayed open; this
	 * watch belongs to the link, made with the page.
	 */
	const watchPointer: Attachment<HTMLAnchorElement> = (link) => {
		let rest: ReturnType<typeof setTimeout> | undefined;
		let away: ReturnType<typeof setTimeout> | undefined;
		const restart = (event: PointerEvent) => {
			if (event.pointerType !== "mouse" || asked) return;
			clearTimeout(rest);
			rest = setTimeout(() => (asked ??= ask()), restDelay);
		};
		const leave = () => {
			clearTimeout(rest);
			if (!open) asked = undefined;
		};
		const closeAway = (event: PointerEvent) => {
			if (!open || event.pointerType !== "mouse") return;
			const target = event.target instanceof Element ? event.target : null;
			if (link.contains(target) || target?.closest(`[id="${contentId}"]`)) {
				clearTimeout(away);
				away = undefined;
			} else {
				away ??= setTimeout(() => {
					away = undefined;
					setOpen(false);
				}, closeDelay * 2);
			}
		};
		link.addEventListener("pointerenter", restart);
		link.addEventListener("pointermove", restart);
		link.addEventListener("pointerleave", leave);
		document.addEventListener("pointermove", closeAway);
		return () => {
			clearTimeout(rest);
			clearTimeout(away);
			link.removeEventListener("pointerenter", restart);
			link.removeEventListener("pointermove", restart);
			link.removeEventListener("pointerleave", leave);
			document.removeEventListener("pointermove", closeAway);
		};
	};

	function setOpen(value: boolean) {
		open = value;
		if (!value) asked = undefined;
	}
</script>

{#snippet anchor(anchorClass: string)}
	{#if load && preview && shown}
		<!--
			The trigger stays a link: no `role="button"` or popup state for screen readers, whose users
			open the page, and it opens by the pointer only, not on focus.
		-->
		<HoverCard.Root
			bind:open={() => open, setOpen}
			openDelay={openDelay()}
			{closeDelay}
			disabled={!finePointer.current}
		>
			<HoverCard.Trigger>
				{#snippet child({ props })}
					<a
						{...rest}
						{...props}
						role={undefined}
						aria-haspopup={undefined}
						aria-expanded={undefined}
						aria-controls={undefined}
						onfocus={undefined}
						onblur={undefined}
						{href}
						class={anchorClass}
						{@attach watchPointer}>{@render children()}</a
					>
				{/snippet}
			</HoverCard.Trigger>
			<HoverCard.Content id={contentId} class="w-80" align="start" data-record-preview>
				<PreviewContent load={() => (asked ??= ask())} children={preview} />
			</HoverCard.Content>
		</HoverCard.Root>
	{:else}
		<a {...rest} {href} class={anchorClass}>{@render children()}</a>
	{/if}
{/snippet}

{#if secondary !== undefined}
	<TwoLineCell {secondary} link={anchor} />
{:else}
	{@render anchor(className)}
{/if}
