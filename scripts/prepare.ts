/**
 * Runs after `pnpm install` (the `prepare` script): sets up Vite+ (`vp config`, its git hooks),
 * writes the generated code (`vpr generate`) and installs Playwright's Chromium for the tests.
 * Except in a Vercel build (which sets `VERCEL`): it runs no tests, and Chromium is a 185 MB
 * download on every deploy. A step that fails doesn't fail the install.
 */
import { spawnSync } from "node:child_process";

/** Runs a command; whether it succeeded. */
const run = (command: string, args: string[]) =>
	spawnSync(command, args, { stdio: "inherit" }).status === 0;

if (run("vp", ["config"])) run("vpr", ["generate"]);

if (process.env.VERCEL) console.log("prepare: a Vercel build, so no Playwright browser.");
else run("playwright", ["install", "chromium"]);
