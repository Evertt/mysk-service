<script lang="ts">
	let { count }: { count: number } = $props();
</script>

<div class={["text-right tabular-nums", count === 0 && "text-muted-foreground"]}>{count}</div>
