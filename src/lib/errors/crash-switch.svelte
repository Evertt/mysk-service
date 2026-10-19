<!--
	@component
	The crash switch (`crash-switch.ts`) at `where`: throws once mounted, if a test asked, so the
	boundary around it fails. In an effect, which runs once per mount, in the browser: a render may
	run more often, e.g. ahead of a navigation (`forkPreloads`), which would use up the crashes a
	test asked for. Render it only `{#if crashSwitches}`, so other builds leave it out.
-->
<script lang="ts">
	import { crashIfAsked } from "./crash-switch.ts";

	let { where }: { where: string } = $props();

	$effect(() => crashIfAsked(where));
</script>
