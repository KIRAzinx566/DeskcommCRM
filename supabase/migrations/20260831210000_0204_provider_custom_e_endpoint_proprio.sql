-- ---- provider "custom" e endpoint próprio na credencial e na versão do agente (migration 0204) ----
--
-- ## O que isto habilita
--
-- Até aqui, "endpoint próprio" (endereço OpenAI-compatível escolhido pelo
-- operador) só existia em `ai_purpose_bindings.base_url` (migration 0126) —
-- serve os pontos AUXILIARES (classificador de etapa, jailbreak, compaction,
-- etc.), configurados no painel de Provedores. Os DOIS pontos que são o
-- próprio agente conversando (`agent_turn`, `operator_turn`) tiram provider e
-- modelo de `ai_agent_versions`, que não tinha onde guardar um endereço — um
-- agente publicado em OpenRouter/NVIDIA com gateway próprio, ou num serviço
-- genérico compatível com a API da OpenAI (Groq, Together, Cerebras, modelo
-- local), sempre batia no endpoint canônico do provider, nunca no endereço
-- que o operador quisesse.
--
-- Duas colunas novas, ambas nullable e sem CHECK (vocabulário aberto, mesma
-- razão da 0127: quem valida a obrigatoriedade cruzada com o provider é a
-- rota, não o banco):
--
--   - `ai_agent_versions.base_url` — o endpoint da versão publicada.
--   - `ai_provider_credentials.base_url` — o endpoint de uma credencial
--     "custom": sem ele a chave não significa nada (não há como saber para
--     onde mandá-la), e é o que permite VALIDAR a chave no cadastro.
--
-- A view seed seed `ai_provider_credentials_safe` precisa listar a coluna
-- nova explicitamente (ela não usa `select *`), senão a tela de Credenciais
-- nunca a vê.

alter table public.ai_agent_versions
  add column if not exists base_url text;

alter table public.ai_provider_credentials
  add column if not exists base_url text;

-- DROP + CREATE, não CREATE OR REPLACE — mesmo idioma da 0023 (que criou esta
-- view) e da 0150. `CREATE OR REPLACE VIEW` proíbe encolher OU reordenar as
-- colunas existentes, e o `test:db` reaplica o baseline.sql inteiro duas vezes
-- (install e depois update, prova de idempotência): a base_url some e reaparece
-- de execução em execução, e DROP + CREATE é o único jeito de nunca depender de
-- qual for o estado anterior da view.
drop view if exists public.ai_provider_credentials_safe;
create view public.ai_provider_credentials_safe
  with (security_invoker = true) as
select id,
       organization_id,
       provider,
       label,
       api_key_last4,
       validated_at,
       validation_error,
       models_available,
       is_active,
       created_by,
       created_at,
       updated_at,
       base_url
  from public.ai_provider_credentials;

-- DROP apaga o ACL da view — reafirma exatamente o grant que o dump original
-- já tinha (GRANT ALL para authenticated e service_role; anon nunca teve nada
-- aqui). Nenhuma migration depois do dump estreitou isto — só a tabela base
-- (0150) —, então estreitar aqui mudaria comportamento que não é desta PR.
grant all on public.ai_provider_credentials_safe to authenticated;
grant all on public.ai_provider_credentials_safe to service_role;

-- `security_invoker = true`: quem lê a view precisa do grant na TABELA base
-- para cada coluna que a view seleciona (0150 já restringiu isso a uma lista
-- fechada de 12 colunas) — sem esta linha, `authenticated` lê a view inteira
-- e recebe "permission denied for column base_url" na hora de contar linhas.
grant select (base_url) on public.ai_provider_credentials to authenticated;
