<!--
	@component
	The number of orders a material is used on, right-aligned.
-->
<script lang="ts">
	let { count }: { count: number } = $props();
</script>

<div class="text-right whitespace-nowrap tabular-nums" class:text-muted-foreground={!count}>
	{count === 1 ? "1 order" : `${count} orders`}
</div>
