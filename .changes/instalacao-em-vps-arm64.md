---
impacto: capacidade_nova
secao: adicionado
titulo: Instalação em VPS ARM64
---

O instalador agora atende VPS ARM64/aarch64, como Oracle Ampere A1, AWS Graviton e Hetzner CAX, inclusive no modo com Supabase na mesma VPS. As imagens do DeskcommCRM são construídas em máquina ARM nativa e publicadas na mesma tag das de amd64, e o WAHA usa a variante oficial NOWEB ARM64.

Nada é compilado na VPS. Quem já roda em ARM passa a atualizar pelas imagens publicadas, e o `update.sh` troca no `.env` o WAHA amd64 antigo pela variante ARM (um valor escolhido à mão fica intacto). Em amd64 nada muda.
