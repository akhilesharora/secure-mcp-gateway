#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const subcommandArgs = args.slice(2);
const DEFAULT_GATEWAY_URL = process.env.SMCP_GATEWAY_URL || "http://localhost:8000";

const commandRegistry = {
  gateway: {
    description: "Manage Secure MCP Gateway runtime",
    subcommands: {
      start: "Start the gateway stack",
      stop: "Stop the gateway stack",
      restart: "Restart the gateway stack",
      logs: "Show gateway logs"
    }
  },
  group: {
    description: "Manage MCP groups and sub-gateways",
    subcommands: {
      list: "List configured MCP groups",
      get: "Get details for one MCP group",
      create: "Create a new MCP group",
      "add-server": "Add a server to an MCP group",
      "remove-server": "Remove a server from an MCP group",
      delete: "Delete an MCP group",
      tools: "Configure tools exposed by a group server"
    }
  },
  server: {
    description: "Manage MCP servers",
    subcommands: {
      list: "List configured MCP servers",
      tools: "List tools exposed by an MCP server",
      add: "Add an MCP server",
      remove: "Remove an MCP server",
      configure: "Update MCP server configuration",
      convert: "Convert a STDIO server to HTTP",
      reload: "Reload server configuration in the gateway"
    }
  }
};

function printHelp() {
  const groups = Object.entries(commandRegistry)
    .map(([name, meta]) => `  ${name.padEnd(17)}${meta.description}`)
    .join("\n");

  console.log(`smcp ${packageJson.version}

Usage:
  smcp <command> [subcommand]

Commands:
  help              Show this help message
  version           Print the installed CLI version
  doctor            Show local runtime diagnostics
  commands          List all command groups and subcommands

Command Groups:
${groups}

Options:
  -h, --help        Show this help message
  -v, --version     Print the installed CLI version

Examples:
  smcp help
  smcp commands
  smcp version
  smcp doctor
  smcp gateway start
  smcp gateway logs
  smcp server list
  smcp server tools github
  smcp server convert playwright-mcp-server
  smcp group list
  smcp group get 2
  smcp group --help
  smcp gateway --help

Notes:
  Use \`smcp <group> --help\` to inspect group-specific commands.
  Group and server commands use the gateway HTTP API.
  Set \`SMCP_GATEWAY_URL\` to point those commands at a non-default gateway.`);
}

function printCommands() {
  console.log("Available smcp commands:\n");

  for (const [groupName, meta] of Object.entries(commandRegistry)) {
    console.log(`${groupName} - ${meta.description}`);
    for (const [name, description] of Object.entries(meta.subcommands)) {
      console.log(`  ${groupName} ${name}`.padEnd(26) + description);
    }
    console.log("");
  }
}

function printGroupHelp(groupName) {
  const meta = commandRegistry[groupName];
  if (!meta) {
    console.error(`Unknown command group: ${groupName}`);
    console.error("Run `smcp commands` to see available command groups.");
    process.exitCode = 1;
    return;
  }

  const subcommandsText = Object.entries(meta.subcommands)
    .map(([name, description]) => `  ${name.padEnd(15)}${description}`)
    .join("\n");

  console.log(`smcp ${groupName}

Usage:
  smcp ${groupName} <subcommand>

Description:
  ${meta.description}

Subcommands:
${subcommandsText}

Examples:
  smcp ${groupName} ${Object.keys(meta.subcommands)[0]}
  smcp ${groupName} --help

Notes:
  Group and server subcommands are API-backed where implemented.
  Gateway subcommands are local runtime helpers.
  The listed subcommands are implemented and ready to use.`);
}

function printScaffoldMessage(groupName, subcommandName) {
  console.log(`smcp ${groupName} ${subcommandName}`);
  console.log("This command is recognized, but not implemented yet.");
  console.log(`Run \`smcp ${groupName} --help\` to see the available subcommands.`);
}

function printJsonIfRequested(value, options) {
  if (options?.json) {
    console.log(JSON.stringify(value, null, 2));
    return true;
  }
  return false;
}

function printVersion() {
  console.log(packageJson.version);
}

function runDoctor() {
  const report = {
    cli: packageJson.name,
    version: packageJson.version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    gateway_url: DEFAULT_GATEWAY_URL
  };

  console.log("smcp doctor");
  for (const [key, value] of Object.entries(report)) {
    console.log(`- ${key}: ${value}`);
  }

  const compose = findComposeContext();
  if (compose) {
    console.log(`- compose_file: ${compose.composeFile}`);
    console.log(`- project_root: ${compose.projectRoot}`);
  } else {
    console.log("- compose_file: not found from current directory");
  }
}

function isHelpFlag(value) {
  return value === "help" || value === "--help" || value === "-h";
}

function hasFlag(flag) {
  return subcommandArgs.includes(flag);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { positionals, options };
}

function parseBoolean(value, fallback = undefined) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value, label) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function parseCsv(value) {
  if (value === undefined || value === "") {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function findComposeContext() {
  let current = process.cwd();
  const root = resolve("/");

  while (true) {
    const rootCompose = join(current, "docker-compose.yml");
    if (existsSync(rootCompose)) {
      return {
        projectRoot: current,
        composeFile: rootCompose
      };
    }

    const javaCompose = join(current, "server-java", "docker-compose.yml");
    if (existsSync(javaCompose)) {
      return {
        projectRoot: current,
        composeFile: javaCompose
      };
    }

    if (current === root) {
      return null;
    }

    current = dirname(current);
  }
}

function ensureDockerRunning() {
  const result = spawnSync("docker", ["info"], {
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        "Docker is not installed or is not on your PATH. " +
        "Install Docker Desktop / Docker Engine and try again."
      );
    }

    throw new Error(`Failed to run docker: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    const stdout = (result.stdout || "").trim();
    const details = stderr || stdout;

    throw new Error(
      "Docker is not running. Please start Docker Desktop / Docker Engine and try again." +
      (details ? `\n\nDocker output:\n${details}` : "")
    );
  }
}

function runDockerCompose(composeArgs, { stream = false } = {}) {
  const context = findComposeContext();

  if (!context) {
    console.error("Could not find a docker-compose.yml for Secure MCP Gateway.");
    console.error("Run this command from the repo root or a subdirectory inside it.");
    process.exitCode = 1;
    return;
  }

  try {
    ensureDockerRunning();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const args = ["compose", "-f", context.composeFile, ...composeArgs];

  if (stream) {
    const child = spawn("docker", args, {
      cwd: context.projectRoot,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
    });
    return;
  }

  const result = spawnSync("docker", args, {
    cwd: context.projectRoot,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`Failed to run docker: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status ?? 0;
}

async function fetchJson(pathname) {
  return requestJson("GET", pathname);
}

async function requestJson(method, pathname, body) {
  let response;
  try {
    response = await fetch(`${DEFAULT_GATEWAY_URL}${pathname}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new Error(
      `Could not reach the gateway at ${DEFAULT_GATEWAY_URL}. ` +
      "Make sure mcp-gateway-java is running or set SMCP_GATEWAY_URL."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload.error || payload.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function printRows(headers, rows) {
  const widths = headers.map((header, index) => {
    const rowWidths = rows.map((row) => String(row[index] ?? "").length);
    return Math.max(header.length, ...rowWidths);
  });

  const formatRow = (row) =>
    row
      .map((cell, index) => String(cell ?? "").padEnd(widths[index]))
      .join("  ");

  console.log(formatRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

async function listGroups() {
  const result = await fetchJson("/mcp/groups");
  const groups = result.groups || [];

  if (hasFlag("--json")) {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  if (groups.length === 0) {
    console.log("No MCP groups found.");
    return;
  }

  const rows = groups.map((group) => [
    group.id ?? "",
    group.name ?? "",
    group.server_count ?? group.serverNames?.length ?? 0,
    group.gateway_url ?? ""
  ]);

  printRows(["ID", "NAME", "SERVERS", "GATEWAY URL"], rows);
}

async function getGroup() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const groupId = positionals[0];

  if (!groupId) {
    throw new Error("Usage: smcp group get <groupId> [--json]");
  }

  const group = await fetchJson(`/mcp/groups/${groupId}`);

  if (printJsonIfRequested(group, options)) {
    return;
  }

  console.log(`ID: ${group.id ?? ""}`);
  console.log(`Name: ${group.name ?? ""}`);
  console.log(`Description: ${group.description ?? ""}`);
  console.log(`Servers: ${(group.serverNames || []).join(", ") || "(none)"}`);
  console.log(`Gateway URL: ${group.gateway_url ?? ""}`);
}

async function createGroup() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const name = positionals[0];

  if (!name) {
    throw new Error("Usage: smcp group create <name> [server1,server2|server1 server2] [--description \"...\"] [--servers server1,server2]");
  }

  const positionalServers = positionals
    .slice(1)
    .flatMap((value) => parseCsv(value));

  const optionServers = parseCsv(options.servers);
  const serverNames = [...new Set([...positionalServers, ...optionServers])];

  const payload = {
    name,
    description: options.description || undefined,
    serverNames
  };

  const result = await requestJson("POST", "/mcp/groups", payload);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Created group ${name}.`);
  if (result.group?.gateway_url) {
    console.log(`Gateway URL: ${result.group.gateway_url}`);
  }
}

async function addServerToGroup() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const groupId = positionals[0];
  const serverName = positionals[1];

  if (!groupId || !serverName) {
    throw new Error("Usage: smcp group add-server <groupId> <serverName> [--json]");
  }

  const result = await requestJson("POST", `/mcp/groups/${groupId}/servers/${serverName}`);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Added ${serverName} to group ${groupId}.`);
}

async function removeServerFromGroup() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const groupId = positionals[0];
  const serverName = positionals[1];

  if (!groupId || !serverName) {
    throw new Error("Usage: smcp group remove-server <groupId> <serverName> [--json]");
  }

  const result = await requestJson("DELETE", `/mcp/groups/${groupId}/servers/${serverName}`);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Removed ${serverName} from group ${groupId}.`);
}

async function deleteGroup() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const groupId = positionals[0];

  if (!groupId) {
    throw new Error("Usage: smcp group delete <groupId>");
  }

  const result = await requestJson("DELETE", `/mcp/groups/${groupId}`);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Deleted group ${groupId}.`);
}

async function configureGroupTools() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const groupId = positionals[0];
  const serverName = positionals[1];

  if (!groupId || !serverName) {
    throw new Error("Usage: smcp group tools <groupId> <serverName> [--allow tool1,tool2 | --all]");
  }

  const tools = options.all ? [] : parseCsv(options.allow);

  if (!options.all && tools.length === 0) {
    throw new Error("Provide --allow tool1,tool2 or use --all to expose all tools.");
  }

  const result = await requestJson(
    "PUT",
    `/mcp/groups/${groupId}/servers/${serverName}/tools`,
    { tools }
  );

  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Updated tools for ${serverName} in group ${groupId}.`);
}

async function listServers() {
  const result = await fetchJson("/mcp/servers");
  const servers = result.servers || [];

  if (hasFlag("--json")) {
    console.log(JSON.stringify(servers, null, 2));
    return;
  }

  if (servers.length === 0) {
    console.log("No MCP servers found.");
    return;
  }

  const rows = servers.map((server) => [
    server.name ?? "",
    server.type ?? "http",
    server.enabled === false ? "disabled" : "enabled",
    server.url ?? ""
  ]);

  printRows(["NAME", "TYPE", "STATUS", "URL"], rows);
}

async function listServerTools() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const serverName = positionals[0];

  if (!serverName) {
    throw new Error("Usage: smcp server tools <serverName> [--json]");
  }

  const result = await fetchJson(`/mcp/list-tools?mcp_server=${encodeURIComponent(serverName)}`);
  const tools = result.tools || [];

  if (options.json) {
    console.log(JSON.stringify(tools, null, 2));
    return;
  }

  if (tools.length === 0) {
    console.log(`No tools found for server ${serverName}.`);
    return;
  }

  const rows = tools.map((tool) => [
    tool.name ?? "",
    tool.description ?? ""
  ]);

  printRows(["NAME", "DESCRIPTION"], rows);
}

function buildServerConfigFromOptions(options, existingConfig = {}) {
  const config = {
    ...existingConfig
  };

  if (options.url !== undefined) {
    config.url = options.url;
  }
  if (options.type !== undefined) {
    config.type = options.type;
  }
  if (options.description !== undefined) {
    config.description = options.description;
  }
  if (options["image-icon"] !== undefined) {
    config.image_icon = options["image-icon"];
  }
  if (options["policy-id"] !== undefined) {
    config.policy_id = options["policy-id"];
  }
  if (options.tags !== undefined) {
    config.tags = parseCsv(options.tags);
  }

  const enabled = parseBoolean(options.enabled, config.enabled);
  if (enabled !== undefined) {
    config.enabled = enabled;
  }

  const timeout = parseNumber(options.timeout, "timeout");
  if (timeout !== undefined) {
    config.timeout = timeout;
  }

  delete config.name;
  delete config.policies;
  delete config.policy_count;
  delete config.policy_error;

  return config;
}

async function addServer() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const serverName = positionals[0];

  if (!serverName) {
    throw new Error("Usage: smcp server add <name> --url <url> --type <type> [--enabled true|false]");
  }

  const config = buildServerConfigFromOptions(options, {});

  if (!config.url || !config.type) {
    throw new Error("Server creation requires both --url and --type.");
  }

  const result = await requestJson("POST", "/mcp/servers", {
    name: serverName,
    ...config
  });
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(`Created server ${serverName}.`);
}

async function removeServer() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const serverName = positionals[0];

  if (!serverName) {
    throw new Error("Usage: smcp server remove <name>");
  }

  const result = await requestJson("DELETE", `/mcp/servers/${serverName}`);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || `Deleted server ${serverName}.`);
}

async function configureServer() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const serverName = positionals[0];

  if (!serverName) {
    throw new Error("Usage: smcp server configure <name> [--url ...] [--type ...] [--description ...] [--enabled true|false]");
  }

  const existingConfig = await fetchJson(`/mcp/servers/${serverName}/config`);
  const mergedConfig = buildServerConfigFromOptions(options, existingConfig);

  const result = await requestJson("PUT", `/mcp/servers/${serverName}/config`, mergedConfig);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(`Updated server ${serverName}.`);
}

async function convertServer() {
  const { positionals, options } = parseArgs(subcommandArgs);
  const serverName = positionals[0];

  if (!serverName) {
    throw new Error("Usage: smcp server convert <serverName> [--json]");
  }

  const result = await requestJson("POST", `/mcp/servers/${serverName}/convert`);
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(`Converted server ${serverName} to HTTP.`);
  if (result.url) {
    console.log(`HTTP URL: ${result.url}`);
  }
}

async function reloadServers() {
  const { options } = parseArgs(subcommandArgs);
  const result = await requestJson("POST", "/mcp/servers/reload");
  if (printJsonIfRequested(result, options)) {
    return;
  }
  console.log(result.message || "Reloaded MCP server configuration.");
}

async function handleGatewayCommand(name) {
  switch (name) {
    case "start":
      runDockerCompose(["up", "-d", "mcp-gateway-java"]);
      return;
    case "stop":
      runDockerCompose(["stop", "mcp-gateway-java"]);
      return;
    case "restart":
      runDockerCompose(["restart", "mcp-gateway-java"]);
      return;
    case "logs":
      runDockerCompose(["logs", "-f", "mcp-gateway-java"], { stream: true });
      return;
    default:
      printScaffoldMessage("gateway", name);
  }
}

async function handleGroupCommand(name) {
  switch (name) {
    case "list":
      await listGroups();
      return;
    case "get":
      await getGroup();
      return;
    case "create":
      await createGroup();
      return;
    case "add-server":
      await addServerToGroup();
      return;
    case "remove-server":
      await removeServerFromGroup();
      return;
    case "delete":
      await deleteGroup();
      return;
    case "tools":
      await configureGroupTools();
      return;
    default:
      printScaffoldMessage("group", name);
  }
}

async function handleServerCommand(name) {
  switch (name) {
    case "list":
      await listServers();
      return;
    case "tools":
      await listServerTools();
      return;
    case "add":
      await addServer();
      return;
    case "remove":
      await removeServer();
      return;
    case "configure":
      await configureServer();
      return;
    case "convert":
      await convertServer();
      return;
    case "reload":
      await reloadServers();
      return;
    default:
      printScaffoldMessage("server", name);
  }
}

async function main() {
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    case "version":
    case "--version":
    case "-v":
      printVersion();
      break;
    case "doctor":
      runDoctor();
      break;
    case "commands":
      printCommands();
      break;
    default:
      if (commandRegistry[command]) {
        if (!subcommand || isHelpFlag(subcommand)) {
          printGroupHelp(command);
          break;
        }

        if (!commandRegistry[command].subcommands[subcommand]) {
          console.error(`Unknown subcommand: ${command} ${subcommand}`);
          console.error(`Run \`smcp ${command} --help\` to see available subcommands.`);
          process.exitCode = 1;
          break;
        }

        if (command === "gateway") {
          await handleGatewayCommand(subcommand);
          break;
        }

        if (command === "group") {
          await handleGroupCommand(subcommand);
          break;
        }

        if (command === "server") {
          await handleServerCommand(subcommand);
          break;
        }
      }

      console.error(`Unknown command: ${command}`);
      console.error("Run `smcp --help` or `smcp commands` to see available commands.");
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
