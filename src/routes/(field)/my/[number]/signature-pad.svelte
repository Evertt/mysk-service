<!--
	@component
	A pad to sign on with a finger, pen or mouse (pointer events). `value` is the signature as a PNG
	data URL, or empty while nothing is drawn. Dark ink on white, like paper, in either colour mode.
-->
<script lang="ts">
	import EraserIcon from "@lucide/svelte/icons/eraser";

	let {
		value = $bindable(""),
		label = m.portal_signature(),
		invalid = false,
	}: { value?: string; label?: string; invalid?: boolean } = $props();

	let canvas: HTMLCanvasElement | undefined;
	let drawing = false;

	/** Sizes the drawing surface to the element (sharp on high-density screens), which clears it. */
	function prepare(element: HTMLCanvasElement) {
		canvas = element;
		const scale = Math.min(window.devicePixelRatio || 1, 2);
		const { width, height } = element.getBoundingClientRect();
		element.width = Math.round(width * scale);
		element.height = Math.round(height * scale);
		const context = element.getContext("2d")!;
		context.setTransform(scale, 0, 0, scale, 0, 0);
		context.lineWidth = 2.5;
		context.lineCap = "round";
		context.lineJoin = "round";
		context.strokeStyle = "#111827";
	}

	function clear() {
		if (canvas) prepare(canvas);
		value = "";
	}

	function point(event: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return [event.clientX - rect.left, event.clientY - rect.top] as const;
	}

	function start(event: PointerEvent) {
		event.preventDefault();
		canvas!.setPointerCapture(event.pointerId);
		drawing = true;
		const context = canvas!.getContext("2d")!;
		const [x, y] = point(event);
		context.beginPath();
		context.moveTo(x, y);
		// A dot for a tap.
		context.lineTo(x + 0.1, y + 0.1);
		context.stroke();
	}

	function move(event: PointerEvent) {
		if (!drawing) return;
		const context = canvas!.getContext("2d")!;
		const [x, y] = point(event);
		context.lineTo(x, y);
		context.stroke();
	}

	function end() {
		if (!drawing) return;
		drawing = false;
		value = canvas!.toDataURL("image/png");
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between gap-2">
		<span class="text-sm font-medium">{label}</span>
		<Button type="button" variant="ghost" size="sm" onclick={clear} disabled={!value}>
			<EraserIcon data-icon="inline-start" />
			{m.portal_signature_clear()}
		</Button>
	</div>
	<canvas
		{@attach prepare}
		aria-label={label}
		aria-invalid={invalid || undefined}
		class={[
			"h-48 w-full touch-none rounded-lg border-2 border-dashed bg-white",
			invalid ? "border-destructive" : "border-input",
		]}
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
	></canvas>
	<p class="text-xs text-muted-foreground">{m.portal_signature_hint()}</p>
</div>
