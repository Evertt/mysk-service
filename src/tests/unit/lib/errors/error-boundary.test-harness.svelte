<!--
	@component
	A part in an `ErrorBoundary`, for `error-boundary.svelte.spec.ts`: it throws `control.error()`
	while rendering, `control.failures` times, and renders "The part works" after that.
-->
<script lang="ts" module>
	export const control = {
		failures: 0,
		error: (): unknown => new Error("The part failed"),
	};
</script>

<script lang="ts">
	import ErrorBoundary from "#lib/errors/error-boundary.svelte";

	function render() {
		if (control.failures > 0) {
			control.failures -= 1;
			throw control.error();
		}
		return "The part works";
	}
</script>

<ErrorBoundary name="test">
	<p>{render()}</p>
</ErrorBoundary>
