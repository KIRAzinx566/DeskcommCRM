/**
 * Ação `add_tag` — merge idempotente de tags no LEAD do contexto (ou no
 * CONTATO, se o contexto não tiver lead). Emite o próprio evento
 * lead.tag_added/contact.tag_added com metadata.caused_by_rule — é a ação, e
 * não um handler reusado, então é ela quem carrega o anti-loop.
 */
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const tags = Array.isArray(config.tags) ? config.tags.map(String) : [];
  if (!tags.length) return { type: "add_tag", status: "skipped", detail: { reason: "no_tags" } };

  const lead = ctx.context.lead as { id: string; tags?: string[] } | undefined;
  const contact = ctx.context.contact as { id: string; tags?: string[] } | undefined;
  const target = lead
    ? { table: "crm_leads", row: lead, event: "lead.tag_added", kind: "crm_lead" }
    : contact
      ? { table: "contacts", row: contact, event: "contact.tag_added", kind: "contact" }
      : null;
  if (!target) return { type: "add_tag", status: "skipped", detail: { reason: "no_target" } };

  const prev = target.row.tags ?? [];
  const added = tags.filter((t) => !prev.includes(t));
  if (!added.length) return { type: "add_tag", status: "success", detail: { added: [] } };

  const merged = [...prev, ...added];
  const { error } = await ctx.admin
    .from(target.table)
    .update({ tags: merged, updated_at: new Date().toISOString() })
    .eq("id", target.row.id)
    .eq("organization_id", ctx.organizationId);
  if (error) return { type: "add_tag", status: "failed", error: error.message };

  await ctx.admin.rpc("emit_event", {
    p_event_type: target.event,
    p_entity_kind: target.kind,
    p_entity_id: target.row.id,
    p_payload: { added_tags: added, tags: merged },
    p_metadata: { caused_by_rule: ctx.ruleId },
    p_organization_id: ctx.organizationId,
  });
  return { type: "add_tag", status: "success", detail: { added } };
}

export async function simulateAddTag(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const tags = Array.isArray(config.tags) ? config.tags.map(String) : [];
  if (!tags.length) return { type: "add_tag", status: "skipped", detail: { reason: "no_tags", simulated: true } };

  const lead = ctx.context.lead as { id: string; tags?: string[] } | undefined;
  const contact = ctx.context.contact as { id: string; tags?: string[] } | undefined;
  const target = lead ? { row: lead, alvo: "lead" } : contact ? { row: contact, alvo: "contato" } : null;
  if (!target) return { type: "add_tag", status: "skipped", detail: { reason: "no_target", simulated: true } };

  const prev = target.row.tags ?? [];
  const added = tags.filter((t) => !prev.includes(t));
  return {
    type: "add_tag",
    status: "success",
    detail: {
      simulated: true,
      explicacao: added.length
        ? `Adicionaria a(s) tag(s) "${added.join('", "')}" ao ${target.alvo}.`
        : `Nenhuma tag nova — o ${target.alvo} já tem todas.`,
      added,
    },
  };
}

registerAction({ type: "add_tag", execute, simulate: simulateAddTag });
