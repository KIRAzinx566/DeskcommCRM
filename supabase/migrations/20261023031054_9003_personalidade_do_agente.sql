-- manifest: **O agente ganha personalidade.** Nova coluna `ai_agent_versions.personality` (jsonb, objeto, default `{}`): apresentação, formalidade/energia/humor/tamanho das mensagens em escalas de 0 a 4, emojis, bordões, palavras proibidas e os gostos de pausa que o escritório virtual usa. É CONTEÚDO da versão — o motor junta o bloco de estilo às instruções do agente publicado (`lib/agent-engine/agent/personalidade.ts`) —, então entra na trava `fn_ai_agent_version_content_immutable` (lista da 0656 + `personality`). Default `{}` = sem personalidade = nada muda no atendimento de quem não configurar. Idempotente.

alter table public.ai_agent_versions
  add column if not exists personality jsonb not null default '{}'::jsonb;

-- Objeto sempre: o motor lê campo a campo e descarta o que não reconhece, mas
-- um array ou um texto no lugar do objeto é dado que nenhuma tela grava.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ai_agent_versions_personality_is_object'
       and conrelid = 'public.ai_agent_versions'::regclass
  ) then
    alter table public.ai_agent_versions
      add constraint ai_agent_versions_personality_is_object
      check (jsonb_typeof(personality) = 'object');
  end if;
end
$$;

comment on column public.ai_agent_versions.personality is
  'Personalidade do agente (seção Personalidade da tela): apresentacao, formalidade/energia/humor/detalhe (0-4), emoji, bordoes, nunca_diz, gostos. Conteúdo da versão: vale depois de publicar e é imutável na publicada. Formato e leitura em lib/agent-engine/agent/personalidade.ts; {} = sem personalidade.';

create or replace function fn_ai_agent_version_content_immutable() returns trigger
-- search_path fixo na PRÓPRIA definição: um create or replace sem a cláusula
-- apaga o alter function ... set search_path da 0521 (invariante
-- tests/invariants/avisos-do-security-advisor.test.ts).
language plpgsql set search_path = '' as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.base_url               is distinct from old.base_url
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.handoff_legal_enabled  is distinct from old.handoff_legal_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.proposal_ai_draft_enabled is distinct from old.proposal_ai_draft_enabled
    or new.inbound_debounce_ms    is distinct from old.inbound_debounce_ms
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
    or new.personality            is distinct from old.personality
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;
create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function fn_ai_agent_version_content_immutable();

notify pgrst, 'reload schema';
