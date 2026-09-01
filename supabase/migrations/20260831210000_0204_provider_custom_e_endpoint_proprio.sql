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

-- `base_url` entra no FIM da lista, não perto de `api_key_last4`: o Postgres só
-- aceita `CREATE OR REPLACE VIEW` quando as colunas existentes mantêm nome e
-- posição — inserir uma coluna nova no meio faz ele ler como "renomear
-- validated_at para base_url" e falhar (`cannot change name of view column`).
create or replace view public.ai_provider_credentials_safe
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
