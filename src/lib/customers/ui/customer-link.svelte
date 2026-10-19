<!--
	@component
	A customer's name linking to their page, unless `children` say otherwise; with `withCode`, their
	code is shown below it (e.g. in table cells), or `secondary` (see `RecordLink`). `class` replaces
	the link's own look. Other attributes go to the anchor.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	let {
		code,
		name,
		withCode = false,
		secondary,
		class: className = "font-medium underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children"> & {
		code: string;
		name: string;
		withCode?: boolean;
		secondary?: string | null;
		children?: Snippet;
	} = $props();
</script>

<RecordLink
	{...rest}
	href={resolve("/(app)/customers/[code]", { code })}
	class={className}
	secondary={withCode ? code : secondary}
>
	{#if children}
		{@render children()}
	{:else}
		{name}
	{/if}
</RecordLink>
