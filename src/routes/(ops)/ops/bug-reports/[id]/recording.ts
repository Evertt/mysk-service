import type { RecordedEvent } from "#lib/bug-reports/events.ts";

/** A report's recording (`recording/+server.ts`), unpacked: its rrweb events. In the browser. */
export async function loadRecording(id: string): Promise<RecordedEvent[]> {
	const response = await fetch(`/ops/bug-reports/${encodeURIComponent(id)}/recording`);
	if (!response.ok || !response.body) throw new Error(`The recording answered ${response.status}`);
	const unpacked = response.body.pipeThrough(new DecompressionStream("gzip"));
	return (await new Response(unpacked).json()) as RecordedEvent[];
}
