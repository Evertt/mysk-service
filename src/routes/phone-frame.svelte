<!--
	@component
	The frame of the two portals, which are phone apps (the engineer portal and the customer portal).
	On a desk's screen it shows the portal in a phone: a device with its bezel, dynamic island, side
	buttons and status bar, centred on a quiet background, its screen a phone's (390 × 844, scaled
	down to fit a shorter window) with the portal scrolling inside it, and a caption under it. A wide
	window with a mouse gets it, by CSS alone (`screen and (min-width: 1024px) and (pointer: fine)`),
	so it's right from the first paint and follows a resize. Elsewhere (a phone, a tablet, a narrow
	window, paper) the wrappers drop out (`display: contents`) and the portal is the page.

	What would be fixed to the window stays in the phone: its screen is the containing block of
	fixed descendants (`contain: layout`), the bits-ui overlays (menus, dialogs, sheets) are put in
	it rather than in `<body>` (`BitsConfig`), and so are the notifications (the root layout leaves
	them out here).

	It also makes the portal an app on any screen: its root has `data-touch`, which gives the kit's
	controls their tap sizes (`#lib/themes/touch.css`); the page runs under a phone's notch and home
	indicator (`viewport-fit=cover`); and `--safe-area-top` and `--safe-area-bottom` say how far the
	portal's bars keep their content from them: the phone's insets, or in the desk's phone those of
	its status bar and home indicator, which the bars run under as on a phone.
-->
<script lang="ts">
	import BatteryFullIcon from "@lucide/svelte/icons/battery-full";
	import SignalIcon from "@lucide/svelte/icons/signal";
	import WifiIcon from "@lucide/svelte/icons/wifi";
	import { BitsConfig } from "bits-ui";
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { Clock } from "#lib/hooks/clock.svelte.ts";
	import { formatTime } from "#lib/i18n/index.ts";

	import AppToaster from "./app-toaster.svelte";

	let {
		caption,
		statusOn = "background",
		children,
	}: {
		/** Under the phone on a desk's screen: whose portal it is, and how they see it. */
		caption: string;
		/** What the status bar's clock and icons are on: the page, or a bar in the primary colour. */
		statusOn?: "background" | "primary";
		children: Snippet;
	} = $props();

	/** Where the overlays go: the phone's screen, once it's there (until then `<body>`). */
	let overlays = $state<HTMLElement>();
	const overlaysHere: Attachment<HTMLElement> = (element) => {
		overlays = element;
		return () => (overlays = undefined);
	};

	/** The status bar's clock, read anew every 15 seconds while it's shown. */
	const ticks = new Clock(15_000);
	const clock = $derived(formatTime(ticks.now));
</script>

<svelte:head>
	<!-- The page runs under the notch and the home indicator; the bars keep clear of them. -->
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="phone-stage" data-phone-stage data-touch data-status-on={statusOn}>
	<div class="phone" data-phone-frame>
		<span class="phone-button phone-button-action" aria-hidden="true"></span>
		<span class="phone-button phone-button-volume-up" aria-hidden="true"></span>
		<span class="phone-button phone-button-volume-down" aria-hidden="true"></span>
		<span class="phone-button phone-button-side" aria-hidden="true"></span>
		<div class="phone-screen" data-phone-screen>
			<div class="phone-status" aria-hidden="true">
				<span class="phone-clock tabular-nums">{clock}</span>
				<span class="phone-island"></span>
				<span class="phone-indicators">
					<SignalIcon class="size-4" />
					<WifiIcon class="size-4" />
					<BatteryFullIcon class="size-5" />
				</span>
			</div>
			<div class="phone-scroll" data-phone-scroll>
				<BitsConfig defaultPortalTo={overlays}>
					{@render children()}
				</BitsConfig>
			</div>
			<div class="phone-overlays" {@attach overlaysHere} data-phone-overlays></div>
			<AppToaster />
			<span class="phone-home-indicator" aria-hidden="true"></span>
		</div>
	</div>
	<p class="phone-caption">{caption}</p>
</div>

<style>
	/* A phone, a tablet or a narrow window: no phone, the portal is the page. */
	.phone-stage,
	.phone,
	.phone-screen,
	.phone-scroll,
	.phone-overlays {
		display: contents;
	}
	.phone-button,
	.phone-status,
	.phone-home-indicator,
	.phone-caption {
		display: none;
	}

	@media screen and (min-width: 1024px) and (pointer: fine) {
		.phone-stage {
			/* The phone's size with its bezel, and how far it's scaled down to fit the window's height
			   with room for the caption (`tan(atan2(a, b))` is a / b as a number). */
			--screen-width: 390px;
			--screen-height: 844px;
			--bezel: 12px;
			--phone-height: calc(var(--screen-height) + 2 * var(--bezel));
			--fit: min(1, tan(atan2(100svh - 6rem, var(--phone-height))));

			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 1rem;
			height: 100svh;
			overflow: hidden;
			background:
				radial-gradient(circle at 50% 35%, var(--background), transparent 70%), var(--muted);
		}

		.phone {
			position: relative;
			display: block;
			flex-shrink: 0;
			width: calc(var(--screen-width) + 2 * var(--bezel));
			height: var(--phone-height);
			padding: var(--bezel);
			border-radius: 64px;
			background: #0b0c0f;
			box-shadow:
				0 0 0 1px rgb(255 255 255 / 0.08) inset,
				0 0 0 2px #2b2d33,
				0 30px 60px -20px rgb(0 0 0 / 0.45),
				0 18px 36px -18px rgb(0 0 0 / 0.5);
			scale: var(--fit);
			/* The space the scaled phone leaves, given back: its box keeps its size. */
			margin-block: calc((var(--fit) - 1) * var(--phone-height) / 2);
		}

		.phone-button {
			position: absolute;
			display: block;
			width: 4px;
			border-radius: 2px;
			background: #2b2d33;
		}
		.phone-button-action {
			left: -4px;
			top: 120px;
			height: 32px;
		}
		.phone-button-volume-up {
			left: -4px;
			top: 180px;
			height: 60px;
		}
		.phone-button-volume-down {
			left: -4px;
			top: 252px;
			height: 60px;
		}
		.phone-button-side {
			right: -4px;
			top: 200px;
			height: 96px;
		}

		.phone-screen {
			position: relative;
			display: flex;
			flex-direction: column;
			width: var(--screen-width);
			height: var(--screen-height);
			overflow: hidden;
			border-radius: 52px;
			background: var(--background);
			color: var(--foreground);
			/* The containing block of what's fixed in the portal (its overlays and notifications), and
			   they're clipped to the screen. */
			contain: layout paint;
			transform: translateZ(0);
		}

		/* Over the portal's top, as a phone's: the portal's bars run under it. */
		.phone-status {
			position: absolute;
			inset: 0 0 auto;
			z-index: 60;
			display: flex;
			pointer-events: none;
			flex-shrink: 0;
			align-items: center;
			justify-content: space-between;
			height: 54px;
			padding: 6px 30px 0 44px;
			font-size: 0.9375rem;
			font-weight: 600;
			color: var(--foreground);
		}
		[data-status-on="primary"] .phone-status {
			color: var(--primary-foreground);
		}
		.phone-island {
			position: absolute;
			top: 11px;
			left: 50%;
			width: 124px;
			height: 36px;
			translate: -50% 0;
			border-radius: 18px;
			background: #000;
		}
		.phone-indicators {
			display: flex;
			align-items: center;
			gap: 0.3rem;
		}

		.phone-scroll {
			/* How far the portal's bars keep from the status bar and the home indicator. */
			--safe-area-top: 54px;
			--safe-area-bottom: 22px;
			display: block;
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
			scrollbar-width: none;
		}

		.phone-overlays {
			display: block;
		}

		.phone-home-indicator {
			position: absolute;
			bottom: 8px;
			left: 50%;
			display: block;
			width: 134px;
			height: 5px;
			translate: -50% 0;
			border-radius: 3px;
			background: var(--foreground);
			opacity: 0.35;
			pointer-events: none;
			z-index: 60;
		}

		.phone-caption {
			display: block;
			flex-shrink: 0;
			color: var(--muted-foreground);
			font-size: 0.875rem;
		}
	}

	@media screen and (min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
		.phone {
			transition: scale 200ms ease-out;
		}
	}
</style>
