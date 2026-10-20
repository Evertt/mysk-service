<!--
	@component
	The square tile with a shell's icon before its name: the app's on the public pages and the
	developers', the tenant's at the top of a sidebar, the engineer's hard hat in the portal's header.
	In a sidebar (`sidebar`) in the sidebar's own primary colours, which a theme may set apart from
	the page's.
-->
<script lang="ts">
	import type { Component } from "svelte";

	let {
		icon: Icon,
		sidebar = false,
	}: {
		icon: Component<{ class?: string }>;
		/** Whether it's in a sidebar, coloured as the sidebar's primary. */
		sidebar?: boolean;
	} = $props();
</script>

<span
	class={[
		"flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg",
		sidebar
			? "bg-sidebar-primary text-sidebar-primary-foreground"
			: "bg-primary text-primary-foreground",
	]}
>
	<Icon class="size-4" />
</span>
