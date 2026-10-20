<!--
	@component
	The frame of the pages outside the app shell (signing in, accepting an invitation): the
	Fieldworks name above a narrow column, with the language, theme and mode switchers in the corner.
-->
<script lang="ts">
	import FactoryIcon from "@lucide/svelte/icons/factory";
	import type { Snippet } from "svelte";

	import AppearanceSwitchers from "./appearance-switchers.svelte";
	import BrandMark from "./brand-mark.svelte";

	let { children }: { children: Snippet } = $props();
</script>

<div
	class="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
>
	<div class="absolute top-4 right-4 flex items-center gap-1">
		<AppearanceSwitchers />
	</div>

	<div class="flex w-full max-w-sm flex-col gap-6">
		<div class="flex items-center gap-2 self-center font-medium">
			<BrandMark icon={FactoryIcon} />
			Fieldworks
		</div>

		{@render children()}
	</div>
</div>
