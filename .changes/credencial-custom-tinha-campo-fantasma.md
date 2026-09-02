---
impacto: nada_mudou
secao: corrigido
titulo: O diálogo de cadastrar credencial oferecia "API customizada" sem o campo do endereço
---

A v1.11.0 trouxe o provider "API customizada" pro editor de agente e pro
painel de Provedores, mas o terceiro lugar onde ele já aparecia — o diálogo
"Adicionar credencial", em IA › Credenciais — listava a opção no seletor sem
ter o campo de endereço nenhum. Quem escolhesse "API customizada" ali recebia
sempre "Provider customizado exige o endereço do endpoint", sem nenhuma forma
de preencher o que faltava. Agora o campo existe, nasce obrigatório para esse
provider, e o cadastro completa.
