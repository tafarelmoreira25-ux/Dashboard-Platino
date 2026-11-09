# Diagnóstico da reestruturação da SDR

Atualização: a auditoria e os limites de busca da etapa seguinte estão em `docs/sdr-performance-audit.md`. As limitações abaixo descrevem o estado do commit inicial da reestruturação.

## Origem dos dados e fluxo preservado

- A SDR usa Firebase Authentication, Firestore e a API `api/sdr.js` com Firebase Admin. Não usa Supabase nem Google Sheets.
- Os leads ficam em `sdrLeads`; notificações, bancos, regras, comentários e eventos usam coleções próprias. Escritas operacionais continuam na API. A interface mantém as sete etapas definidas em `src/sdr/sdr-core.js` e os rascunhos locais existentes.
- `Qualificado` identifica a saída da qualificação, `APROVADO` a aprovação após a análise/documento, e `LEAD APROVADO` o resultado comercial posterior. São estados distintos no fluxo; os valores persistidos não foram alterados.
- O antigo listener trazia até 500 leads e renderizava todos na fila. A mudança limita a página ativa a 10, 20 ou 50 documentos, com um documento adicional para detectar a próxima página. A interface mostra uma seção de cada vez. A página corrente sem busca textual mantém um único listener; os demais listeners existentes continuam para notificações, catálogo e regras.

## Limites e validação necessária antes de publicar

- A pesquisa atual aceita substring em nome, telefone, CPF, protocolo e banco. Os documentos antigos não possuem índice de busca normalizado. Para preservar esse comportamento sem migrar dados, a busca e algumas combinações de filtros percorrem lotes Firestore sob demanda até completar uma página. Em buscas raras, isso pode consultar muitos documentos; não há carregamento integral na abertura da aba. Um índice de busca e plano de preenchimento dos documentos históricos são necessários para garantir custo limitado em todos os casos. Nenhuma migração foi executada.
- Contagens de indicadores usam agregações Firestore, não a página visível. Consultas com escopo do usuário e status/classificação/data podem precisar de índices compostos. Se não existirem no projeto publicado, o indicador mostra `—` e registra o erro no console. Validar os índices antes da publicação; este trabalho não os publicou.
- A ordenação da fila agora segue a ordem estável de documentos usada pelos cursores, em vez da ordenação local por `updatedAt` do lote antigo. Para ordenar por atualização em toda a coleção, será preciso índice composto por proprietário/consultor e `updatedAt`.
- A fila sem filtro é atualizada em tempo real somente na página ativa. Resultados de busca textual são consultas sob demanda e podem ser atualizados pelo botão **Atualizar carteira**. As gravações principais solicitam nova consulta.
- Os rascunhos legados usam uma chave local compartilhada entre contas neste navegador. Alterar isso exige uma estratégia de migração dos rascunhos sem identificação do proprietário; o armazenamento não foi modificado nesta etapa.
- Não houve validação com contas de teste autorizadas, índice real, volume real de leituras ou navegação visual autenticada. Testes automatizados de interface atuais são verificações de código, não interação de navegador.

Não publicar esta branch enquanto a pesquisa com custo limitado, os índices necessários e a validação autenticada estiverem pendentes.
