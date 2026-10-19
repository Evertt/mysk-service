<!--
	@component
	A customer's name linking to their page, unless `children` say otherwise; with `withCode`, their
	code is shown below it (e.g. in table cells), or `secondary` (see `RecordLink`). `class` replaces
	the link's own look. Other attributes go to the anchor. Resting the pointer on it shows the
	customer's hover card (`CustomerPreview`), unless `preview={false}`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import RecordLink from "#lib/components/record-link/record-link.svelte";

	import { getCustomer } from "../customers.remote.ts";
	import CustomerPreview from "./customer-preview.svelte";

	let {
		code,
		name,
		withCode = false,
		secondary,
		preview = true,
		class: className = "font-medium underline-offset-4 hover:underline",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "children" | "class"> & {
		/** The link's classes, instead of its own look. */
		class?: string;
		code: string;
		name: string;
		withCode?: boolean;
		secondary?: string | null;
		/** Whether resting the pointer on it shows the customer's hover card. */
		preview?: boolean;
		children?: Snippet;
	} = $props();
</script>

{#snippet card(record: Awaited<ReturnType<typeof getCustomer>>)}
	<CustomerPreview {...record} />
{/snippet}

<RecordLink
	{...rest}
	href={resolve("/(app)/customers/[code]", { code })}
	class={className}
	secondary={withCode ? code : secondary}
	load={() => getCustomer(code)}
	preview={preview ? card : undefined}
>
	{#if children}
		{@render children()}
	{:else}
		{name}
	{/if}
</RecordLink>
