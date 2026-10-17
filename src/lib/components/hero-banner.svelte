<!--
	@component
	A page's banner, a band in the brand's colour: a row of chips above the title (what the page is,
	the record it's about, a live state with a dot), the title and a line under it, actions on the
	right and anything else below (`children`). Breadcrumbs go above it, as on `PageHeader`. Light and
	dark, after the theme's primary colour; a live dot pulses unless motion is reduced.
-->
<script lang="ts" module>
	/** A chip above the title. */
	export interface HeroChip {
		label: string;
		/** A dot before the label: a `live` one pulses, a `still` one doesn't. */
		dot?: "live" | "still";
		/** Text without the chip's tint, for a state rather than a name. */
		plain?: boolean;
		/** What the chip is (`data-hero-chip`), for tests. */
		id?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from "svelte";

	import { cn } from "#lib/utils.ts";

	let {
		title,
		description,
		breadcrumbs,
		chips = [],
		actions,
		children,
		class: className,
	}: {
		title: string;
		description?: string;
		/** The trail above the banner; the last item is the current page, so it has no `href`. */
		breadcrumbs?: { label: string; href?: string }[];
		chips?: HeroChip[];
		/** On the right of the title (below it on a phone): buttons, best `variant="secondary"`. */
		actions?: Snippet;
		/** Below the title and its line. */
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<div class="flex flex-col gap-4">
	{#if breadcrumbs}
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each breadcrumbs as { label, href }, index (index)}
					{#if index > 0}
						<Breadcrumb.Separator />
					{/if}
					<Breadcrumb.Item>
						{#if href}
							<Breadcrumb.Link {href}>{label}</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page>{label}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	{/if}
	<header
		class={cn(
			"rounded-lg border border-primary/30 bg-linear-to-r from-[color-mix(in_oklch,var(--primary),black_24%)] to-primary px-5 py-5 text-white sm:px-6 dark:border-primary/20 dark:from-[color-mix(in_oklch,var(--primary),black_64%)] dark:to-[color-mix(in_oklch,var(--primary),black_40%)]",
			className,
		)}
		data-hero
	>
		{#if chips.length}
			<div class="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide uppercase">
				{#each chips as chip, index (index)}
					<span
						class={[
							"inline-flex items-center gap-1.5",
							!chip.plain && "rounded-sm bg-white/15 px-2 py-0.5",
						]}
						data-hero-chip={chip.id}
					>
						{#if chip.dot}
							<span class="relative flex size-1.5" aria-hidden="true">
								{#if chip.dot === "live"}
									<span
										class="absolute inline-flex size-full rounded-full bg-emerald-300 opacity-75 motion-safe:animate-ping"
									></span>
								{/if}
								<span
									class={[
										"relative inline-flex size-1.5 rounded-full",
										chip.dot === "live" ? "bg-emerald-300" : "bg-white/60",
									]}
								></span>
							</span>
						{/if}
						{chip.label}
					</span>
				{/each}
			</div>
		{/if}
		<div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div class="min-w-0">
				<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
				{#if description}
					<p class="mt-1 max-w-3xl text-sm text-white/85">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex flex-wrap items-center gap-2 print:hidden">{@render actions()}</div>
			{/if}
		</div>
		{@render children?.()}
	</header>
</div>
