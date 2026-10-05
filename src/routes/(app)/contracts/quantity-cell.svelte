<!--
	@component
	A right-aligned quantity with its unit, e.g. "3 units" or "24 h".
-->
<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<div class="text-right whitespace-nowrap tabular-nums">{text}</div>
