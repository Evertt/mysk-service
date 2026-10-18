/**
 * Moves this process's clocks to `TEST_NOW`, if set (see `clock.ts`): the Node test projects'
 * first setup file, and what `NODE_OPTIONS` (`--import`) loads into each Node process started by
 * a process that did, before its own code.
 */
import { installTestClock } from "./clock.ts";

await installTestClock();
