<!--
	@component
	A made-up page with try it in the middle of its text, to see that the rest of it renders
	whatever the demo's answer.
-->
<script lang="ts">
	import TryIt from "#wiki/parts/try-it.svelte";
</script>

<p>Before the link</p>
<TryIt as="planner" />
<p>After the link</p>
