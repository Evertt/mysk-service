<!--
	@component
	A diagram in a wiki page: an `<svg>` as wide as its column (`width="100%"`, the `viewBox` keeps
	its proportions, so it fits a phone without scrolling sideways), announced as an image by its
	`label`. Draw the children in the `viewBox`'s units, and colour them only with the theme's CSS
	variables (`stroke="var(--border)"`, `fill="var(--primary)"`, `fill="var(--muted-foreground)"`,
	…) so light, dark and every theme work. Never a raw colour.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		viewBox,
		label,
		children,
	}: {
		/** `"0 0 W H"`: the drawing's own units. */
		viewBox: string;
		/** What the diagram shows, for those who can't see it. */
		label: string;
		children: Snippet;
	} = $props();
</script>

<svg
	{viewBox}
	width="100%"
	role="img"
	aria-label={label}
	class="not-prose my-6 h-auto max-w-full text-foreground"
	font-family="inherit"
	font-size="12"
>
	{@render children()}
</svg>
