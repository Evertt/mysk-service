#!/bin/bash
# Prepares a Claude Code cloud session: the pnpm version the project pins, Node's fetch() through the
# proxy, a local .env and the dependencies. Does nothing on your own machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Keep stdout for Claude's context: everything below logs to stderr.
exec 3>&1 1>&2

# Persist variables for the session's commands.
persist() {
	if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
		echo "$1" >>"$CLAUDE_ENV_FILE"
	fi
}

# Node's own fetch() ignores HTTPS_PROXY unless this is set; Paraglide downloads its plugins with it.
export NODE_USE_ENV_PROXY=1
persist 'export NODE_USE_ENV_PROXY=1'

# The pnpm version package.json pins (devEngines), in a folder of its own, ahead on the PATH.
version=$(node -p 'require("./package.json").devEngines.packageManager.version')
prefix="$HOME/.cache/pnpm-versions/$version"
if [ ! -x "$prefix/node_modules/.bin/pnpm" ]; then
	npm install --prefix "$prefix" --no-save --no-audit --no-fund "pnpm@$version"
fi
export PATH="$prefix/node_modules/.bin:$PATH"
persist "export PATH=\"$prefix/node_modules/.bin:\$PATH\""

# A local .env (gitignored) from the example, with a fresh secret.
if [ ! -f .env ]; then
	secret=$(openssl rand -base64 32)
	sed -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=\"$secret\"|" \
		-e 's|^ORIGIN=.*|ORIGIN="http://localhost:5173"|' .env.example >.env
fi

# The dependencies. Their prepare script generates the module registries and Paraglide's messages,
# but through `vpr`, whose tasks don't get the proxy's variables, so Paraglide can't download its
# plugins there; generating directly fills its cache (project.inlang/cache), which later runs use.
pnpm install
pnpm generate

echo "Session ready: pnpm $(pnpm --version), dependencies installed." >&3
