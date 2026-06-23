# Checklist de entrega - 30 de junho

## Estado atual

- Login: Firebase Auth ativo no front-end, com acesso por e-mail e senha.
- Gestor: perfil gestor definido pelo UID `yRW5stqXWZT7ovrQyn1Fd3WNuta2`.
- Firestore: usado para central de avisos, ranking e feedbacks.
- Storage: Firebase Storage removido; PDFs ficam como arquivos locais do site.
- IA: chat e busca usam a base local; endpoint externo de IA esta opcional e vazio em `config.js`.
- Branding: topo com marca Platino e assinatura discreta `Powered by CeliOS`.

## Segurança

- `api/firebase-config.js` agora aceita apenas `GET`.
- `firestore.rules` exige login para leitura de conteudo do app.
- Edicao de avisos/ranking e leitura/tratativa de feedbacks ficam restritas ao UID gestor.
- Criacao de feedback foi limitada a campos esperados, tamanhos maximos e `handled == false`.
- Deploy das regras ainda precisa ser feito quando aprovado:
  `firebase deploy --only firestore:rules --project platino-hub`

## Armazenamento

- Os PDFs estao no diretorio publico do site e podem ser acessados por URL direta.
- Isso esta coerente com a decisao atual de manter PDFs apenas como referencia, sem dados restritos.
- Antes de publicar novos PDFs, revisar e remover logins, senhas, dados pessoais e informacoes internas sensiveis.
- `apresentacao_platino.pdf` esta com 0 bytes e deve ser removido ou substituido antes da entrega, se for usado.

## Logins da equipe

- O app nao cria usuarios; os usuarios precisam existir no Firebase Authentication.
- Antes da entrega, revisar a lista de usuarios no Firebase Console e remover contas antigas/desativadas.
- O mapa visual de nomes no sistema fica em `updateUserAccess()` no `index.html`.
- Se houver mais gestores, sera melhor trocar o UID unico por uma lista controlada ou por custom claims.

## IA no chat

- Sem endpoint externo, a IA responde pela base local em `cerebro-platino-organizado.js` e `knowledge-engine.js`.
- Para IA generativa real, preencher `window.PLATINO_CONFIG.aiEndpoint` em `config.js`.
- O endpoint deve ficar no servidor, nunca no front-end, para proteger a chave do provedor de IA.
- O endpoint esperado recebe `POST` com `question`, `context` e `mode`, e retorna `answer` ou `text`.

## Pendencias antes da entrega

- Publicar as regras novas do Firestore.
- Revisar usuarios e senhas no Firebase Auth.
- Revisar os PDFs locais e remover qualquer informacao restrita.
- Decidir se `apresentacao_platino.pdf` sera removido ou substituido.
- Configurar variaveis no Vercel: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`.
- Testar login real de gestor e login real de equipe.
- Testar envio de feedback por equipe e tratativa por gestor.
- Testar edicao de avisos/ranking pelo gestor.
- Decidir se a IA ficara apenas com base local ou com endpoint externo.
