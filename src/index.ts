#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { DiscordClient } from "./discord.js";
import { registerChannelTools } from "./tools/channels.js";
import { registerGuildTools } from "./tools/guild.js";
import { registerMemberTools } from "./tools/members.js";
import { registerRawTools } from "./tools/raw.js";
import { registerRoleTools } from "./tools/roles.js";
import type { ToolContext } from "./util.js";

const config = loadConfig();
const server = new McpServer(
  { name: "discord-mcp", version: "1.0.0" },
  {
    instructions:
      "Tools for configuring Discord guilds through a bot. Start with list_guilds and get_guild_snapshot " +
      "to learn IDs and the current state before changing anything. Permissions are given as names " +
      "(see list_permission_names). The @everyone role's ID equals the guild ID.",
  },
);

const ctx: ToolContext = { server, discord: new DiscordClient(config), config };
registerGuildTools(ctx);
registerChannelTools(ctx);
registerRoleTools(ctx);
registerMemberTools(ctx);
registerRawTools(ctx);

await server.connect(new StdioServerTransport());
console.error(`discord-mcp running (read_only=${config.readOnly}, raw=${config.allowRawRequests})`);
