import { z } from "zod";
import type { APIGuildChannel, ChannelType } from "discord-api-types/v10";

/** Guild channels as returned by the REST API (position is always present there). */
export type GuildChannel = APIGuildChannel & { position: number };
import { toBitfield } from "../permissions.js";
import { compact, defineTool, reason, snowflake, type ToolContext } from "../util.js";

const CHANNEL_TYPES = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  stage: 13,
  forum: 15,
  media: 16,
} as const;

export function channelTypeName(type: ChannelType | number): string {
  return Object.entries(CHANNEL_TYPES).find(([, v]) => v === type)?.[0] ?? `type_${type}`;
}

const overwriteInput = z.object({
  target_id: snowflake.describe("Role ID (the guild ID means @everyone) or member ID"),
  type: z.enum(["role", "member"]),
  allow: z.array(z.string()).default([]).describe("Permission names to allow"),
  deny: z.array(z.string()).default([]).describe("Permission names to deny"),
});

function toApiOverwrite(o: z.infer<typeof overwriteInput>) {
  return { id: o.target_id, type: o.type === "role" ? 0 : 1, allow: toBitfield(o.allow), deny: toBitfield(o.deny) };
}

const channelFields = {
  name: z.string().min(1).max(100).optional(),
  parent_id: snowflake.nullable().optional().describe("Category ID; null to move out of a category"),
  topic: z.string().max(4096).nullable().optional(),
  nsfw: z.boolean().optional(),
  rate_limit_per_user: z.number().int().min(0).max(21600).optional().describe("Slowmode seconds"),
  bitrate: z.number().int().min(8000).optional().describe("Voice only"),
  user_limit: z.number().int().min(0).max(99).optional().describe("Voice only; 0 = unlimited"),
  position: z.number().int().min(0).optional(),
  permission_overwrites: z
    .array(overwriteInput)
    .optional()
    .describe("Replaces ALL overwrites on the channel. Prefer set_permission_overwrite for single changes."),
};

function summarize(c: GuildChannel) {
  return { id: c.id, name: c.name, type: channelTypeName(c.type), parent_id: c.parent_id ?? null, position: c.position };
}

export function registerChannelTools(ctx: ToolContext): void {
  const { discord } = ctx;

  defineTool(ctx, "create_channel", {
    description: "Create a channel or category in a guild.",
    input: {
      guild_id: snowflake,
      type: z.enum(Object.keys(CHANNEL_TYPES) as [keyof typeof CHANNEL_TYPES]).default("text"),
      ...channelFields,
      name: z.string().min(1).max(100),
      reason,
    },
    handler: async ({ guild_id, type, permission_overwrites, reason, ...fields }) => {
      discord.assertGuildAllowed(guild_id);
      const body = compact({
        ...fields,
        type: CHANNEL_TYPES[type],
        permission_overwrites: permission_overwrites?.map(toApiOverwrite),
      });
      const c = await discord.request<GuildChannel>("POST", `/guilds/${guild_id}/channels`, { body, reason });
      return summarize(c);
    },
  });

  defineTool(ctx, "update_channel", {
    description: "Update a channel's settings. Only passed fields are changed.",
    input: {
      channel_id: snowflake,
      ...channelFields,
      lock_permissions: z
        .boolean()
        .optional()
        .describe("With parent_id: sync overwrites with the new category"),
      reason,
    },
    handler: async ({ channel_id, permission_overwrites, reason, ...fields }) => {
      await discord.assertChannelAllowed(channel_id);
      const body = compact({ ...fields, permission_overwrites: permission_overwrites?.map(toApiOverwrite) });
      const c = await discord.request<GuildChannel>("PATCH", `/channels/${channel_id}`, { body, reason });
      return summarize(c);
    },
  });

  defineTool(ctx, "delete_channel", {
    description: "Delete a channel or category. Deleting a category does NOT delete its child channels. Irreversible.",
    input: { channel_id: snowflake, reason },
    destructive: true,
    handler: async ({ channel_id, reason }) => {
      await discord.assertChannelAllowed(channel_id);
      const c = await discord.request<GuildChannel>("DELETE", `/channels/${channel_id}`, { reason });
      return { deleted: summarize(c) };
    },
  });

  defineTool(ctx, "reorder_channels", {
    description: "Bulk-update channel positions and/or parent categories.",
    input: {
      guild_id: snowflake,
      positions: z
        .array(
          z.object({
            id: snowflake,
            position: z.number().int().min(0).optional(),
            parent_id: snowflake.nullable().optional(),
            lock_permissions: z.boolean().optional(),
          }),
        )
        .min(1),
      reason,
    },
    handler: async ({ guild_id, positions, reason }) => {
      discord.assertGuildAllowed(guild_id);
      await discord.request("PATCH", `/guilds/${guild_id}/channels`, { body: positions.map(compact), reason });
      return { updated: positions.length };
    },
  });

  defineTool(ctx, "set_permission_overwrite", {
    description:
      "Set (create or replace) one permission overwrite on a channel for a role or member. " +
      "Use the guild ID as target_id for @everyone. Permissions not listed in allow/deny are inherited.",
    input: { channel_id: snowflake, ...overwriteInput.shape, reason },
    handler: async ({ channel_id, reason, ...ow }) => {
      await discord.assertChannelAllowed(channel_id);
      const { id, ...body } = toApiOverwrite(ow);
      await discord.request("PUT", `/channels/${channel_id}/permissions/${id}`, { body, reason });
      return { channel_id, target_id: id, allow: ow.allow, deny: ow.deny };
    },
  });

  defineTool(ctx, "delete_permission_overwrite", {
    description: "Remove a role's or member's permission overwrite from a channel.",
    input: { channel_id: snowflake, target_id: snowflake, reason },
    destructive: true,
    handler: async ({ channel_id, target_id, reason }) => {
      await discord.assertChannelAllowed(channel_id);
      await discord.request("DELETE", `/channels/${channel_id}/permissions/${target_id}`, { reason });
      return { channel_id, removed: target_id };
    },
  });
}
