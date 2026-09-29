---
impacto: nada_mudou
secao: corrigido
titulo: A atualização não acusa mais regra de isolamento que sempre esteve no banco
---

No Ubuntu 26.04 com o idioma do sistema em `en_US.UTF-8` ou `pt_BR.UTF-8` (outras distribuições e o `C.UTF-8` não são afetados), a conferência de regras de isolamento do `update.sh` podia acusar como ausentes regras que estavam no banco, e a atualização parava no meio com a tela de manutenção de pé, mandando procurar uma regra que nunca faltou. Agora a ordenação e a comparação usam ordem de bytes, e o resultado é o mesmo em qualquer idioma. Instalação que nunca passou por esse aviso não muda em nada.

Se a sua atualização já parou nesse aviso, o `update.sh` que está no disco é o antigo, e é ele que roda a conferência na atualização que traz este conserto, tanto no terminal quanto no botão "Atualizar". Ela pode parar mais uma vez no mesmo aviso. Para sair numa passada só, rode uma vez na pasta do CRM:

```bash
git fetch --tags origin
git checkout v1.58.1
bash hostgator-setup-kit/update.sh --to v1.58.1 --force
```

Depois disso as atualizações seguintes voltam a rodar sozinhas.

Contribuição de @gideony (#1837).
