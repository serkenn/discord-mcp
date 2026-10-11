import { z } from "zod";
import type { APIGuild, APIPartialGuild, APIRole } from "discord-api-types/v10";
import { fromBitfield, PERMISSION_NAMES } from "../permissions.js";
import { compact, defineTool, formatColor, reason, snowflake, type ToolContext } from "../util.js";
import { channelTypeName, type GuildChannel } from "./channels.js";

export function registerGuildTools(ctx: ToolContext): void {
  const { discord } = ctx;

  defineTool(ctx, "list_guilds", {
    description: "List the guilds (servers) the bot is in and allowed to manage.",
    input: {},
    readOnly: true,
    handler: async () => {
      const guilds = await discord.request<APIPartialGuild[]>("GET", "/users/@me/guilds");
      return guilds.filter((g) => discord.isGuildAllowed(g.id)).map((g) => ({ id: g.id, name: g.name }));
    },
  });

  defineTool(ctx, "get_guild_snapshot", {
    description:
      "Get a full overview of a guild's configuration: settings, roles (with permission names), and channels " +
      "grouped by category with their permission overwrites. Call this first before making changes.",
    input: { guild_id: snowflake },
    readOnly: true,
    handler: async ({ guild_id }) => {
      discord.assertGuildAllowed(guild_id);
      const [guild, roles, channels] = await Promise.all([
        discord.request<APIGuild & { approximate_member_count?: number }>("GET", `/guilds/${guild_id}`, {
          query: { with_counts: true },
        }),
        discord.request<APIRole[]>("GET", `/guilds/${guild_id}/roles`),
        discord.request<GuildChannel[]>("GET", `/guilds/${guild_id}/channels`),
      ]);

      const roleNames = new Map(roles.map((r) => [r.id, r.name]));
      const fmtChannel = (c: GuildChannel) => ({
        id: c.id,
        name: c.name,
        type: channelTypeName(c.type),
        position: c.position,
        ...("topic" in c && c.topic ? { topic: c.topic } : {}),
        ...("nsfw" in c && c.nsfw ? { nsfw: true } : {}),
        ...("rate_limit_per_user" in c && c.rate_limit_per_user ? { slowmode: c.rate_limit_per_user } : {}),
        overwrites: (c.permission_overwrites ?? []).map((o) => ({
          target_id: o.id,
          target: o.type === 0 ? `role:${roleNames.get(o.id) ?? o.id}` : `member:${o.id}`,
          allow: fromBitfield(o.allow),
          deny: fromBitfield(o.deny),
        })),
      });

      const byPosition = (a: GuildChannel, b: GuildChannel) => a.position - b.position;
      const categories = channels.filter((c) => c.type === 4).sort(byPosition);
      const children = (parentId: string | null) =>
        channels
          .filter((c) => c.type !== 4 && (c.parent_id ?? null) === parentId)
          .sort(byPosition)
          .map(fmtChannel);

      return {
        guild: {
          id: guild.id,
          name: guild.name,
          description: guild.description,
          owner_id: guild.owner_id,
          member_count: guild.approximate_member_count,
          preferred_locale: guild.preferred_locale,
          verification_level: guild.verification_level,
          default_message_notifications: guild.default_message_notifications,
          explicit_content_filter: guild.explicit_content_filter,
          system_channel_id: guild.system_channel_id,
          rules_channel_id: guild.rules_channel_id,
          public_updates_channel_id: guild.public_updates_channel_id,
          afk_channel_id: guild.afk_channel_id,
          afk_timeout: guild.afk_timeout,
          features: guild.features,
        },
        roles: roles
          .sort((a, b) => b.position - a.position)
          .map((r) => ({
            id: r.id,
            name: r.name,
            position: r.position,
            color: formatColor(r.color),
            hoist: r.hoist,
            mentionable: r.mentionable,
            managed: r.managed,
            permissions: fromBitfield(r.permissions),
          })),
        channels: {
          uncategorized: children(null),
          categories: categories.map((cat) => ({ ...fmtChannel(cat), channels: children(cat.id) })),
        },
      };
    },
  });

  defineTool(ctx, "update_guild", {
    description:
      "Update guild settings. Only passed fields are changed. " +
      "verification_level: 0=none 1=low 2=medium 3=high 4=very_high. " +
      "default_message_notifications: 0=all 1=mentions only. explicit_content_filter: 0=off 1=no roles 2=everyone.",
    input: {
      guild_id: snowflake,
      name: z.string().min(2).max(100).optional(),
      description: z.string().nullable().optional(),
      verification_level: z.number().int().min(0).max(4).optional(),
      default_message_notifications: z.number().int().min(0).max(1).optional(),
      explicit_content_filter: z.number().int().min(0).max(2).optional(),
      afk_channel_id: snowflake.nullable().optional(),
      afk_timeout: z.enum(["60", "300", "900", "1800", "3600"]).optional().describe("Seconds"),
      system_channel_id: snowflake.nullable().optional(),
      rules_channel_id: snowflake.nullable().optional(),
      public_updates_channel_id: snowflake.nullable().optional(),
      preferred_locale: z.string().optional().describe('e.g. "ja", "en-US"'),
      reason,
    },
    handler: async ({ guild_id, reason, afk_timeout, ...fields }) => {
      discord.assertGuildAllowed(guild_id);
      const body = compact({ ...fields, afk_timeout: afk_timeout === undefined ? undefined : Number(afk_timeout) });
      const g = await discord.request<APIGuild>("PATCH", `/guilds/${guild_id}`, { body, reason });
      return { id: g.id, name: g.name, updated: Object.keys(body) };
    },
  });

  defineTool(ctx, "list_permission_names", {
    description: "List valid permission names accepted by role and overwrite tools.",
    input: {},
    readOnly: true,
    handler: async () => PERMISSION_NAMES,
  });
}
