import { z } from "zod";
import type { APIGuildMember } from "discord-api-types/v10";
import { defineTool, reason, snowflake, type ToolContext } from "../util.js";

function summarize(m: APIGuildMember) {
  return {
    id: m.user.id,
    username: m.user.username,
    display_name: m.nick ?? m.user.global_name ?? m.user.username,
    bot: m.user.bot ?? false,
    roles: m.roles,
    joined_at: m.joined_at,
  };
}

export function registerMemberTools(ctx: ToolContext): void {
  const { discord } = ctx;

  defineTool(ctx, "list_members", {
    description:
      "List guild members (paginated by user ID). Requires the Server Members privileged intent on the bot.",
    input: {
      guild_id: snowflake,
      limit: z.number().int().min(1).max(1000).default(100),
      after: snowflake.optional().describe("Return members with user ID greater than this"),
    },
    readOnly: true,
    handler: async ({ guild_id, limit, after }) => {
      discord.assertGuildAllowed(guild_id);
      const members = await discord.request<APIGuildMember[]>("GET", `/guilds/${guild_id}/members`, {
        query: { limit, after },
      });
      return members.map(summarize);
    },
  });

  defineTool(ctx, "search_members", {
    description: "Search guild members whose username or nickname starts with the query.",
    input: { guild_id: snowflake, query: z.string().min(1), limit: z.number().int().min(1).max(1000).default(25) },
    readOnly: true,
    handler: async ({ guild_id, query, limit }) => {
      discord.assertGuildAllowed(guild_id);
      const members = await discord.request<APIGuildMember[]>("GET", `/guilds/${guild_id}/members/search`, {
        query: { query, limit },
      });
      return members.map(summarize);
    },
  });

  defineTool(ctx, "add_member_role", {
    description: "Give a role to a member.",
    input: { guild_id: snowflake, user_id: snowflake, role_id: snowflake, reason },
    handler: async ({ guild_id, user_id, role_id, reason }) => {
      discord.assertGuildAllowed(guild_id);
      await discord.request("PUT", `/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, { reason });
      return { user_id, added_role: role_id };
    },
  });

  defineTool(ctx, "remove_member_role", {
    description: "Remove a role from a member.",
    input: { guild_id: snowflake, user_id: snowflake, role_id: snowflake, reason },
    destructive: true,
    handler: async ({ guild_id, user_id, role_id, reason }) => {
      discord.assertGuildAllowed(guild_id);
      await discord.request("DELETE", `/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, { reason });
      return { user_id, removed_role: role_id };
    },
  });
}
