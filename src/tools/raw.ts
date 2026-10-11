import { z } from "zod";
import { defineTool, reason, type ToolContext } from "../util.js";

/**
 * Escape hatch for endpoints without a dedicated tool (AutoMod, onboarding, emojis, webhooks, ...).
 * Only registered when DISCORD_ALLOW_RAW_REQUESTS=true.
 */
export function registerRawTools(ctx: ToolContext): void {
  const { discord, config } = ctx;
  if (!config.allowRawRequests) return;

  defineTool(ctx, "discord_api_request", {
    description:
      "Call any Discord REST API v10 endpoint as the bot, e.g. GET /guilds/{id}/auto-moderation/rules. " +
      "Use only when no dedicated tool exists. Paths containing /guilds/{id} are checked against the guild allowlist.",
    input: {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().startsWith("/").describe("Path after /api/v10, e.g. /guilds/123/emojis"),
      query: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional().describe("JSON body"),
      reason,
    },
    destructive: true,
    handler: async ({ method, path, query, body, reason }) => {
      const guildId = /^\/guilds\/(\d+)/.exec(path)?.[1];
      if (guildId) discord.assertGuildAllowed(guildId);
      const channelId = /^\/channels\/(\d+)/.exec(path)?.[1];
      if (channelId) await discord.assertChannelAllowed(channelId);
      if (!guildId && !channelId && method !== "GET" && config.allowedGuildIds) {
        throw new Error("Non-GET requests outside /guilds/{id} or /channels/{id} are blocked while an allowlist is set");
      }
      return discord.request(method, path, { query, body, reason });
    },
  });
}
