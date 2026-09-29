---
impacto: nada_mudou
secao: corrigido
titulo: Quem já tinha o DeskcommCRM rodando em ARM (VPS aarch64) volta a conseguir atualizar
---

Quem já tinha o DeskcommCRM instalado numa VPS ARM (Oracle Ampere, aarch64)
volta a conseguir rodar `update.sh`. Desde a v1.35.0 a atualização era recusada
logo na primeira linha, dizendo que só existe VPS x86_64, mesmo onde o CRM já
estava funcionando. Agora, onde já existe instalação, a recusa vira um aviso e
as imagens da versão nova são construídas na própria VPS (leva de 15 a 25
minutos a mais).

A instalação NOVA continua recusada: quem ainda não instalou precisa de uma VPS
x86_64, como antes.

Se a sua VPS ARM está numa versão anterior à v1.35.0, a atualização normal já
traz este conserto. Se ela já está na v1.35.0 ou mais nova e a atualização vinha
sendo recusada, o `update.sh` que está no disco é o antigo e continua recusando,
tanto no terminal quanto no botão "Atualizar". Para sair, rode uma vez na pasta
do CRM, trocando `vX.Y.Z` pelo número desta versão:

```bash
git fetch --tags origin
git checkout vX.Y.Z
bash hostgator-setup-kit/update.sh --to vX.Y.Z --force
```

Depois disso as atualizações seguintes voltam a rodar sozinhas.

Contribuição de @webtecnica (#1775).
