# Implantação do módulo SDR

1. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`.
2. Se a regra geral já foi validada pela gestão, configure `SDR_DEFAULT_REDUCTION_PERCENTAGE` e, opcionalmente, as demais variáveis `SDR_DEFAULT_*`.
3. Execute `npm run migrate:sdr`.
4. Publique `firestore.rules` no projeto Firebase.
5. Na Gestão de Contas, atribua o perfil operacional `SDR`, `Consultor`, `Analista` ou `Gestor do SDR`.
6. Entre novamente para que novas claims de acesso sejam carregadas.

Sem um percentual aprovado, a migração não inventa uma regra financeira: o gestor deve cadastrá-la na aba **Configurações** do SDR antes de executar uma análise.

O módulo SDR não utiliza Firebase Storage. Contratos não são anexados e os PDFs são gerados exclusivamente no navegador para download imediato. O Firestore guarda somente os dados da análise e o registro auditável da geração: nome, versão, hash, responsável e data.
