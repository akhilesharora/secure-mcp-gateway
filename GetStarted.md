# Get Started

This guide shows the two main ways to use Secure MCP Gateway:

- `CLI` via the `smcp` npm package
- `UI` via the local web application

## CLI

The CLI is published as the npm package `smcp`.

### Install

```bash
npm install -g smcp
```

Or run it without installing globally:

```bash
npx smcp --help
```

### Common Commands

Discover available commands:

```bash
smcp --help
smcp commands
```

List configured MCP servers:

```bash
smcp server list
```

List tools exposed by one MCP server:

```bash
smcp server tools mock-server
```

List MCP groups:

```bash
smcp group list
```

Create a group:

```bash
smcp group create dev-tools mock-server,playwright-mcp-server
```

Reload server configuration:

```bash
smcp server reload
```

### CLI Notes

- API-backed commands target `http://localhost:8000` by default.
- Override the gateway URL with:

```bash
export SMCP_GATEWAY_URL="http://your-host:8000"
```

- `gateway` commands are local Docker helpers:

```bash
smcp gateway start
smcp gateway stop
smcp gateway restart
smcp gateway logs
```

- Docker must be running before using `smcp gateway ...`.

## UI

The UI runs locally and is the easiest way to browse and manage MCP servers, groups, and policies.

### Start the stack

From the repo root:

```bash
docker-compose up -d
```

This starts:

- Frontend UI
- Java gateway
- PostgreSQL
- Policy engine
- STDIO proxy service
- Keycloak
- Mock MCP server

### Open the UI

Navigate to:

```text
http://localhost:5173
```

### What you can do in the UI

- View available MCP servers
- Add MCP servers from the catalog
- Create and manage MCP groups
- Configure which tools are exposed through a group gateway
- Convert STDIO servers to HTTP
- Copy group gateway URLs for MCP clients

### Useful local URLs

- UI: `http://localhost:5173`
- Gateway API: `http://localhost:8000`
- Keycloak: `http://localhost:8080`
- Policy engine: `http://localhost:9000`

### Verify the stack

Check that the gateway is healthy:

```bash
curl http://localhost:8000/actuator/health
```

Check that the mock MCP server is healthy:

```bash
curl http://localhost:3000/health
```

### Stop the stack

```bash
docker-compose down
```
