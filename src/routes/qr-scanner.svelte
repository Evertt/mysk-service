<!--
	@component
	The portals' QR scanner, full screen: the back camera's picture with a viewfinder, reading QR
	codes as they come into view. A code of this app's units and locations (`/q/<token>`,
	`scannedPath()`) opens it, through the code's redirect, which leads each portal to the unit, or
	the customer portal to reporting a breakdown at a location. Any other code is "not one of ours",
	and the scanner keeps looking: it never goes to another site.

	It reads with the browser's own `BarcodeDetector` where it has one (Chrome on Android and on a
	Mac), else with the `barcode-detector` ponyfill (zxing-cpp in WebAssembly, served from the app,
	not a CDN), loaded only then. Without a camera, or with the camera refused, it says so and offers
	to type the code: the serial number under a unit's QR code, or the code's link.

	Its box is fixed to the screen (in the desk's phone, its screen: `phone-frame.svelte`).
-->
<script lang="ts">
	import { page } from "$app/state";
	import CameraOffIcon from "@lucide/svelte/icons/camera-off";
	import KeyboardIcon from "@lucide/svelte/icons/keyboard";
	import ScanLineIcon from "@lucide/svelte/icons/scan-line";
	import XIcon from "@lucide/svelte/icons/x";
	import type { BarcodeDetector as Detector } from "barcode-detector/ponyfill";
	import { AnimationFrames } from "runed";
	import { onDestroy, onMount } from "svelte";

	import { scannedPath, typedPath } from "./qr-scanner.ts";

	let {
		unitPath,
		onclose,
	}: {
		/** The page of the unit of a typed serial number, in the portal that scans. */
		unitPath: (serialNumber: string) => string;
		/** Leaves the scanner. */
		onclose: () => void;
	} = $props();

	type Camera = "starting" | "scanning" | "denied" | "unavailable";
	let camera = $state<Camera>("starting");
	/** Whether the last code read isn't one of ours. */
	let foreign = $state(false);
	/** Whether the field to type the code is shown. */
	let typing = $state(false);
	let typed = $state("");
	let typedWrong = $state(false);
	let video = $state<HTMLVideoElement>();

	let stream: MediaStream | null = null;
	let detector: Detector | null = null;
	let reading = false;
	let leaving = false;

	/** The browser's own detector where it reads QR codes, else the ponyfill's, served from here. */
	async function makeDetector(): Promise<Detector> {
		const native = (globalThis as { BarcodeDetector?: typeof Detector }).BarcodeDetector;
		if (native && (await native.getSupportedFormats()).includes("qr_code")) {
			return new native({ formats: ["qr_code"] });
		}
		const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] = await Promise.all([
			import("barcode-detector/ponyfill"),
			import("zxing-wasm/reader/zxing_reader.wasm?url"),
		]);
		prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith(".wasm") ? wasm : prefix + path,
			},
		});
		return new BarcodeDetector({ formats: ["qr_code"] });
	}

	function stopCamera() {
		frames.stop();
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
	}

	async function startCamera() {
		camera = "starting";
		if (!navigator.mediaDevices?.getUserMedia) {
			camera = "unavailable";
			typing = true;
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
				audio: false,
			});
		} catch (error) {
			const refused =
				error instanceof DOMException &&
				(error.name === "NotAllowedError" || error.name === "SecurityError");
			camera = refused ? "denied" : "unavailable";
			typing = true;
			return;
		}
		if (leaving) return stopCamera();
		camera = "scanning";
		if (video) {
			video.srcObject = stream;
			await video.play().catch(() => {});
		}
		detector ??= await makeDetector();
		frames.start();
	}

	/** Goes to a code's page: a whole page load, which follows its redirect on the server. */
	function open(path: string) {
		leaving = true;
		stopCamera();
		window.location.assign(path);
	}

	// About eight looks a second, one at a time.
	const frames = new AnimationFrames(
		async () => {
			if (reading || !detector || !video || video.readyState < 2) return;
			reading = true;
			try {
				const [code] = await detector.detect(video);
				if (code && !leaving) {
					const path = scannedPath(code.rawValue, page.url.origin);
					if (path) open(path);
					else foreign = true;
				}
			} catch {
				// A frame it couldn't read: the next one.
			} finally {
				reading = false;
			}
		},
		{ immediate: false, fpsLimit: 8 },
	);

	function submitTyped(event: SubmitEvent) {
		event.preventDefault();
		const path = typedPath(typed, page.url.origin, unitPath);
		typedWrong = !path;
		if (path) open(path);
	}

	onMount(() => {
		void startCamera();
	});
	onDestroy(() => {
		leaving = true;
		stopCamera();
	});

	const blocked = $derived(camera === "denied" || camera === "unavailable");
</script>

<div
	class="qr-scanner fixed inset-0 z-50 flex flex-col bg-black text-white"
	role="dialog"
	aria-modal="true"
	aria-label={m.common_scan_title()}
	data-qr-scanner={camera}
>
	<video
		bind:this={video}
		class={["absolute inset-0 size-full object-cover", camera !== "scanning" && "invisible"]}
		playsinline
		muted
	></video>

	<header class="relative z-10 flex items-center gap-2 px-2 pt-[calc(var(--safe-area-top)+0.5rem)]">
		<Button
			variant="ghost"
			size="icon"
			class="rounded-full text-white hover:bg-white/15 hover:text-white"
			aria-label={m.common_scan_close()}
			onclick={onclose}
		>
			<XIcon class="size-6" />
		</Button>
		<h1 class="text-[1.0625rem] font-semibold">{m.common_scan_title()}</h1>
	</header>

	{#if blocked}
		<div
			class="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
		>
			<span class="flex size-16 items-center justify-center rounded-full bg-white/10">
				<CameraOffIcon class="size-8" />
			</span>
			<h2 class="text-xl font-semibold" data-scan-blocked={camera}>
				{camera === "denied" ? m.common_scan_denied_title() : m.common_scan_unavailable_title()}
			</h2>
			<p class="text-[0.9375rem] text-white/75">
				{camera === "denied" ? m.common_scan_denied() : m.common_scan_unavailable()}
			</p>
			{#if camera === "denied"}
				<Button
					variant="ghost"
					class="text-white underline-offset-4 hover:bg-white/10 hover:text-white"
					onclick={() => startCamera()}
				>
					{m.common_scan_retry()}
				</Button>
			{/if}
		</div>
	{:else}
		<div class="relative z-10 flex flex-1 items-center justify-center">
			<div class="viewfinder aspect-square w-[70%] max-w-72 rounded-3xl" aria-hidden="true"></div>
			{#if camera === "starting"}
				<p class="absolute text-[0.9375rem] text-white/80" role="status">
					{m.common_scan_starting()}
				</p>
			{/if}
		</div>
	{/if}

	<div
		class="relative z-10 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-6 pb-[calc(var(--safe-area-bottom)+1rem)]"
	>
		{#if !blocked}
			<p
				class={[
					"flex items-center justify-center gap-2 text-center text-[0.9375rem]",
					foreign ? "font-semibold text-white" : "text-white/80",
				]}
				role="status"
				data-scan-foreign={foreign ? "" : undefined}
			>
				<ScanLineIcon class="size-4 shrink-0" />
				{foreign ? m.common_scan_foreign() : m.common_scan_hint()}
			</p>
		{/if}
		{#if typing}
			<form
				class="flex flex-col gap-2 rounded-2xl bg-card p-3 text-card-foreground"
				onsubmit={submitTyped}
				data-scan-typed
			>
				<label for="scan-code" class="section-label">{m.common_scan_code_label()}</label>
				<div class="flex gap-2">
					<Input
						id="scan-code"
						bind:value={typed}
						autocomplete="off"
						autocapitalize="characters"
						spellcheck={false}
						placeholder={m.common_scan_code_placeholder()}
						aria-invalid={typedWrong || undefined}
						aria-describedby={typedWrong ? "scan-code-wrong" : undefined}
					/>
					<Button type="submit">{m.common_scan_open()}</Button>
				</div>
				{#if typedWrong}
					<p id="scan-code-wrong" class="text-sm text-destructive">{m.common_scan_foreign()}</p>
				{/if}
			</form>
		{:else}
			<Button
				variant="secondary"
				class="primary-action"
				onclick={() => (typing = true)}
				data-scan-type
			>
				<KeyboardIcon data-icon="inline-start" />
				{m.common_scan_type()}
			</Button>
		{/if}
	</div>
</div>

<style>
	/* The viewfinder: a clear square, the rest of the picture dimmed around it. */
	.viewfinder {
		box-shadow:
			0 0 0 2px rgb(255 255 255 / 0.9),
			0 0 0 100vmax rgb(0 0 0 / 0.45);
	}
</style>
