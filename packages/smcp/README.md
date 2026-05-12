# `smcp`

`smcp` is the command-line interface for Secure MCP Gateway.

It is designed for open-source usage:
- installable via npm
- runnable locally from this repo
- API-backed for MCP group/server management
- Docker-aware for local gateway runtime helpers

## Install

Global install:

```bash
npm install -g smcp
```

Run without global install:

```bash
npx smcp --help
```

## Requirements

- Node.js `>=18`
- For `gateway` commands: Docker + Docker Compose
- For `group` and `server` API commands: a running Secure MCP Gateway instance

By default, API-backed commands target:

```bash
http://localhost:8000
```

Override that with:

```bash
export SMCP_GATEWAY_URL="http://your-host:8000"
```

## Local development from this repo

```bash
npm install
npm run smcp -- --help
```

You can also run the package directly:

```bash
npm --workspace smcp run smcp -- commands
```

Or from inside `packages/smcp`:

```bash
node smcp.js --help
node smcp.js server list
```

## Commands

Discover commands:

```bash
smcp --help
smcp commands
smcp group --help
smcp server --help
smcp gateway --help
```

### Gateway commands

These are local runtime helpers built on Docker Compose:

```bash
smcp gateway start
smcp gateway stop
smcp gateway restart
smcp gateway logs
```

### Group commands

These use the existing Secure MCP Gateway HTTP API:

```bash
smcp group list
smcp group get 1
smcp group create engineering --description "Engineering tools" --servers github,slack
smcp group create engineering github,slack
smcp group add-server 1 github
smcp group remove-server 1 github
smcp group delete 1
smcp group tools 1 github --allow create_issue,list_repos
smcp group tools 1 github --all
```

### Server commands

These also use the existing HTTP API:

```bash
smcp server list
smcp server tools github
smcp server add github --url https://api.githubcopilot.com/mcp --type http --enabled true
smcp server remove github
smcp server configure github --description "GitHub MCP server" --timeout 60 --enabled true
smcp server convert playwright-mcp-server
smcp server reload
```

## Open-source usage notes

- `group` and `server` commands are implemented on top of backend APIs already exposed by Secure MCP Gateway.
- `gateway` commands are intentionally local helpers because there are no backend start/stop endpoints.
- If the gateway is not reachable, `smcp` prints a clear error and suggests setting `SMCP_GATEWAY_URL`.

## Publish

From the repo root, publish the workspace package explicitly:

```bash
npm publish --workspace smcp
```

Preview the publish payload:

```bash
npm pack --dry-run --workspace smcp
```

If the unscoped name `smcp` is already taken on npm, switch to a scoped package name such as `@datacline/smcp` before publishing.
