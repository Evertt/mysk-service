/**
 * This worker's app and database (see `global-setup.ts`): files on other workers run at the same
 * time against their own.
 */
import { inject } from "vite-plus/test";

const lanes = inject("lanes");
export const lane = lanes[(Number(process.env.VITEST_POOL_ID ?? 1) - 1) % lanes.length];

export const baseURL = lane.baseURL;
