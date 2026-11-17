-- manifest: **A pesquisa de satisfação do fork dá lugar à do upstream (9352).** O fork perguntava a nota pelo `event_log` (`lib/csat`, tabela `csat_requests`, ligada de fábrica); o upstream passou a perguntar na própria rota de encerramento (`satisfacao_do_atendimento`, desligada de fábrica, com tela de resultado). As duas juntas mandariam duas perguntas. O código do fork sai; esta migration leva o que ele tinha: a opção (quem usou nos últimos 90 dias fica com a do upstream ligada) e o histórico de notas. `csat_requests` fica, como histórico que a exportação LGPD ainda entrega. Só dados, nenhuma estrutura. Idempotente.

-- 1. A opção: quem usou a pesquisa do fork nos últimos 90 dias (e não a
--    desligou) fica com a do upstream LIGADA. A pergunta só vai junto quando
--    era personalizada — a padrão do fork dá lugar à padrão do upstream, que
--    sai traduzida no idioma da empresa. Quem já mexeu em `settings.satisfacao`
--    não é tocado.
update public.organizations o
   set settings = jsonb_set(
         coalesce(o.settings, '{}'::jsonb),
         '{satisfacao}',
         jsonb_build_object('ligado', true)
           || case
                when nullif(btrim(o.settings->'csat'->>'pergunta'), '') is not null
                 and btrim(o.settings->'csat'->>'pergunta')
                     <> 'De 1 a 5, como foi o nosso atendimento hoje? Responda só com o número. 🙏'
                then jsonb_build_object('pergunta', btrim(o.settings->'csat'->>'pergunta'))
                else '{}'::jsonb
              end,
         true)
 where coalesce(o.settings, '{}'::jsonb) ? 'satisfacao' = false
   and coalesce(o.settings->'csat'->>'enabled', 'true') <> 'false'
   and exists (
     select 1 from public.csat_requests r
      where r.organization_id = o.id
        and r.sent_at > now() - interval '90 days'
   );

-- 2. O histórico: cada pedido do fork vira um pedido do upstream. Respondido
--    com nota → `respondida`; o resto (sem resposta, vencido, ou pendente que
--    ninguém mais vai ler) → `sem_nota`, que nunca entra na média. Repetir não
--    duplica: o pedido é reconhecido pela conversa e pelo instante da pergunta.
insert into public.satisfacao_do_atendimento
  (organization_id, conversation_id, contact_id, status, nota,
   perguntado_em, expira_em, respondido_em, created_at)
select r.organization_id, r.conversation_id, r.contact_id,
       case when r.status = 'answered' and r.score is not null then 'respondida' else 'sem_nota' end,
       case when r.status = 'answered' and r.score is not null then r.score end,
       r.sent_at, r.expires_at,
       case when r.status = 'answered' and r.score is not null then coalesce(r.answered_at, r.sent_at) end,
       r.created_at
  from public.csat_requests r
 where not exists (
   select 1 from public.satisfacao_do_atendimento s
    where s.conversation_id = r.conversation_id
      and s.perguntado_em = r.sent_at
 );
