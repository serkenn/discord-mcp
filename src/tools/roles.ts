import { z } from "zod";
import type { APIRole } from "discord-api-types/v10";
import { fromBitfield, toBitfield } from "../permissions.js";
import { compact, defineTool, formatColor, parseColor, reason, snowflake, type ToolContext } from "../util.js";

const roleFields = {
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional().describe("Permission names; replaces the role's full permission set"),
  color: z.string().optional().describe('Hex color like "#5865F2"; "#000000" for none'),
  hoist: z.boolean().optional().describe("Display separately in the member list"),
  mentionable: z.boolean().optional(),
};

function toApiRole({ permissions, color, ...rest }: { permissions?: string[]; color?: string; [k: string]: unknown }) {
  return compact({
    ...rest,
    permissions: permissions === undefined ? undefined : toBitfield(permissions),
    color: parseColor(color),
  });
}

function summarize(r: APIRole) {
  return {
    id: r.id,
    name: r.name,
    position: r.position,
    color: formatColor(r.color),
    hoist: r.hoist,
    mentionable: r.mentionable,
    permissions: fromBitfield(r.permissions),
  };
}

export function registerRoleTools(ctx: ToolContext): void {
  const { discord } = ctx;

  defineTool(ctx, "create_role", {
    description: "Create a role. The bot can only manage roles positioned below its own highest role.",
    input: { guild_id: snowflake, ...roleFields, name: z.string().min(1).max(100), reason },
    handler: async ({ guild_id, reason, ...fields }) => {
      discord.assertGuildAllowed(guild_id);
      const r = await discord.request<APIRole>("POST", `/guilds/${guild_id}/roles`, { body: toApiRole(fields), reason });
      return summarize(r);
    },
  });

  defineTool(ctx, "update_role", {
    description: "Update a role. Only passed fields are changed.",
    input: { guild_id: snowflake, role_id: snowflake, ...roleFields, reason },
    handler: async ({ guild_id, role_id, reason, ...fields }) => {
      discord.assertGuildAllowed(guild_id);
      const r = await discord.request<APIRole>("PATCH", `/guilds/${guild_id}/roles/${role_id}`, {
        body: toApiRole(fields),
        reason,
      });
      return summarize(r);
    },
  });

  defineTool(ctx, "delete_role", {
    description: "Delete a role. Irreversible.",
    input: { guild_id: snowflake, role_id: snowflake, reason },
    destructive: true,
    handler: async ({ guild_id, role_id, reason }) => {
      discord.assertGuildAllowed(guild_id);
      await discord.request("DELETE", `/guilds/${guild_id}/roles/${role_id}`, { reason });
      return { deleted: role_id };
    },
  });

  defineTool(ctx, "reorder_roles", {
    description: "Bulk-update role positions (higher number = higher in the list).",
    input: {
      guild_id: snowflake,
      positions: z.array(z.object({ id: snowflake, position: z.number().int().min(0) })).min(1),
      reason,
    },
    handler: async ({ guild_id, positions, reason }) => {
      discord.assertGuildAllowed(guild_id);
      const roles = await discord.request<APIRole[]>("PATCH", `/guilds/${guild_id}/roles`, { body: positions, reason });
      return roles.sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, position: r.position }));
    },
  });
}
