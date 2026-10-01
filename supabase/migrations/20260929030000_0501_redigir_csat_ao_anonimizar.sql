-- 0501 — CSAT entra na cascata de anonimização, via gatilho (issue #1504).
--
-- `csat_requests.raw_reply` guarda o que o CLIENTE respondeu à pesquisa de
-- satisfação — a mesma classe de dado que `messages.body` (o passo 3 da
-- própria cascata), só que numa tabela que a função canônica
-- (`fn_lgpd_cascade_redact_contact`) não alcança: ela lê `csat_requests` por
-- `contact_id`, não por texto de conversa. Sem este trigger, anonimizar um
-- contato devolve SUCESSO, a mensagem original em `messages.body` some, e a
-- resposta idêntica (ou parecida) que o mesmo cliente deu à pesquisa
-- continua legível em `csat_requests.raw_reply` — o mesmo modo de falha que
-- `tests/invariants/lgpd-redact-unificado-alcanca-pelo-catalogo.test.ts`
-- existe para pegar.
--
-- TRIGGER e não um passo dentro de `fn_lgpd_cascade_redact_contact`, pelo
-- mesmo motivo das migrations 0174/0184/0210: o gancho é a transição
-- `is_anonymized false → true` em `contacts`, roda na MESMA transação, e
-- alcança qualquer caminho que anonimize um contato, não só o cascade.
--
-- O que é PRESERVADO: `status`, `score` (a nota numérica) e os timestamps —
-- que a pesquisa foi enviada e respondida, e com que nota, é a métrica de
-- CSAT da organização; não é texto da pessoa. Só o texto livre (`raw_reply`)
-- é apagado.
create or replace function public.fn_redigir_csat_do_contato_anonimizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.csat_requests
     set raw_reply = null
   where organization_id = new.organization_id
     and contact_id = new.id
     and raw_reply is not null;
  return new;
end;
$$;

-- Função de trigger não exige EXECUTE de quem dispara o UPDATE, então
-- revogar das três origens não a quebra — mesma régua da 0210.
revoke execute on function public.fn_redigir_csat_do_contato_anonimizado() from public, anon, authenticated;
grant  execute on function public.fn_redigir_csat_do_contato_anonimizado() to service_role;

drop trigger if exists trg_redigir_csat_ao_anonimizar on public.contacts;
create trigger trg_redigir_csat_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized is true and old.is_anonymized is distinct from true)
  execute function public.fn_redigir_csat_do_contato_anonimizado();

comment on column public.csat_requests.raw_reply is
  'Resposta em texto livre do cliente à pesquisa de satisfação — mesma classe de dado que messages.body. O trigger trg_redigir_csat_ao_anonimizar a apaga quando o contato é anonimizado. status, score e os timestamps são PRESERVADOS: a métrica de CSAT da organização não é dado da pessoa.';
