<!--
	@component
	A short text of a message with code in it, the code between backticks: "Scoped with `inTenant()`".
	The code is shown in `<code>` (`class` styles it), the rest as it is. Messages hold such texts
	whole, so a translation can move the code where its language puts it.
-->
<script lang="ts">
	import { codeParts } from "../code-parts.ts";

	let {
		text,
		class: className = "font-mono",
	}: {
		/** The message's text, code between backticks. */
		text: string;
		/** Classes of each `<code>`. */
		class?: string;
	} = $props();
</script>

{#each codeParts(text) as part, index (index)}{#if part.code}<code class={className}
			>{part.text}</code
		>{:else}{part.text}{/if}{/each}
