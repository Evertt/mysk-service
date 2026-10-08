<!--
	@component
	A form's submit button: disabled, with a spinner in place of its `icon`, while the form is
	pending. Other props (`variant`, `size`, `class`, …) go to the button.
-->
<script lang="ts">
	import type { Component } from "svelte";

	import type { ButtonProps } from "#lib/components/ui/button/index.ts";

	let {
		pending = false,
		icon: Icon,
		disabled,
		children,
		...restProps
	}: Omit<ButtonProps, "type" | "href"> & {
		/** Whether the form is submitting; a remote form's `pending` count works too. */
		pending?: boolean | number;
		icon?: Component;
	} = $props();
</script>

<Button type="submit" disabled={!!pending || disabled} {...restProps}>
	{#if pending}
		<Spinner data-icon="inline-start" />
	{:else if Icon}
		<Icon data-icon="inline-start" />
	{/if}
	{@render children?.()}
</Button>
