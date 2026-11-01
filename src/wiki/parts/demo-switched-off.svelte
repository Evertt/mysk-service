<!--
	@component
	One sentence for the try-the-demo page where the SHLTR demo's one-click sign-in is switched off
	(`demoSignInEnabled()`, production): there the page's `<TryIt>` buttons render nothing, and this
	says why. Nothing where it's on, or where the answer can't be had.
-->
<script lang="ts">
	import { demoSignInEnabled } from "#routes/demo.remote.ts";
</script>

<svelte:boundary>
	{#if !(await demoSignInEnabled())}
		<p>{m.wiki_demo_off()}</p>
	{/if}
	{#snippet failed()}{/snippet}
</svelte:boundary>
