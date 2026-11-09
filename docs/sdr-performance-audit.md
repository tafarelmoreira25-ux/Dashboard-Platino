# Auditoria de desempenho da SDR

## Busca e paginação

O commit anterior consultava lotes de até 51 documentos até achar uma página de resultados. Uma busca sem correspondências podia ler toda a carteira do usuário. A lista tinha debounce de 250 ms e cancelamento lógico, mas nenhum limite de leitura.

Agora cada busca com filtro local consulta **no máximo 200 documentos por operação**. Ela retorna a página apenas quando encontra o documento adicional que comprova a próxima página ou chega ao fim da consulta. Se atingir o teto sem essa prova, interrompe e mostra uma mensagem explícita; não apresenta resultados parciais nem afirma que não há resultados. O debounce de 250 ms e o cancelamento lógico continuam. Requisições já enviadas ao Firestore não podem ser desfeitas; resultados obsoletos são descartados.

`phoneKey` e `documentKey` já existem, mas não há campo normalizado que cubra a busca atual por substring em nome, telefone, CPF/CNPJ, protocolo e banco. Consultas por um único desses campos também precisariam preservar o escopo do usuário. A busca completa e sem teto de varredura **não está resolvida sem alteração de dados/índices**. A estratégia atual protege custo por operação e informa quando a resposta seria incompleta.

Páginas sem busca textual usam um único listener limitado a `pageSize + 1` documentos. Filtros com varredura usam lotes de no máximo 51. As páginas filtradas já consultadas podem ser reutilizadas por até 10 segundos na mesma conta, perfil, seção, combinação de filtros e tamanho de página; mudanças locais de lead, filtros, perfil e saída da conta invalidam o cache. A numeração só libera páginas progressivamente alcançáveis por cursor. O total é solicitado por agregação apenas quando a consulta direta pode representá-lo corretamente.

## Plano de migração para busca completa — não executado

1. Confirmar com o responsável pelo produto se a busca deve manter substring em todos os campos. Uma busca por prefixo de palavra e identificador exato é muito mais barata, mas altera o comportamento atual e requer aprovação explícita.
2. Se a substring for obrigatória, medir volume de leads e avaliar um índice invertido próprio no Firestore, com termos normalizados e referência ao lead e ao proprietário. Isso aumenta documentos, gravações e índices; a quantidade deve ser estimada antes de escolher essa arquitetura. Um simples campo de nome normalizado não cobre substring em todos os campos.
3. Preparar migração idempotente de documentos históricos, com contagem prévia por usuário, validação de escopo, lotes pequenos, checkpoint, rollback e verificação de igualdade dos resultados. Novos leads precisariam gravar a mesma chave na API.
4. Criar somente os índices aprovados após comparar com os existentes. Testar em ambiente seguro com dois perfis. Mudar a interface para a nova consulta apenas quando o preenchimento histórico estiver completo.

Nenhuma etapa desse plano foi executada nesta branch.

## Consultas e índices

`docs/sdr-firestore-indexes-propostos.json` contém **candidatos**, não uma configuração ativa. `firebase.json` não referencia esse arquivo. A leitura de índices do projeto `platino-hub` por `firebase firestore:indexes --project platino-hub --json` retornou HTTP 401; portanto, não foi possível confirmar quais candidatos já existem ou executar `Query Explain` contra o banco real.

| Uso | Consulta | Índice adicional potencial |
| --- | --- | --- |
| Carteira, retornos e filtros sem texto | `sdrLeads` por `ownerSdrId` ou `assignedConsultantId`, `limit(pageSize + 1)`, cursor | Índice de campo único normalmente automático; gestores usam a coleção sem escopo. |
| Status na carteira do gestor | `status == valor`, com cursor | Índice de campo único normalmente automático. Para outros perfis o filtro ainda usa varredura limitada, evitando índice composto novo até aprovação. |
| Indicadores de status | escopo por responsável + `status ==`, `in` ou `not-in` | `ownerSdrId,status` e `assignedConsultantId,status`, ambos ascendentes. |
| Indicadores de classificação | escopo + `commercialClassification ==` | `ownerSdrId,commercialClassification` e `assignedConsultantId,commercialClassification`. |
| Contatos de hoje | escopo + intervalo em `nextContactAt` | `ownerSdrId,nextContactAt` e `assignedConsultantId,nextContactAt`. |
| Retornos vencidos | escopo opcional + intervalo em `nextContactAt` + `status not-in` | `nextContactAt,status`, com prefixo `ownerSdrId` ou `assignedConsultantId` para contas não gestoras. Confirmar ordem do índice com erro real/Query Explain antes de criar. |
| Cadastro e qualificação | leitura pontual de perfil e lead; catálogo ativo; regras; comentários/eventos por `leadId` | Consultas por ID ou campo único, sem índice composto novo identificado. |

As regras Firestore permanecem inalteradas. Consultas dos usuários continuam restritas ao UID de proprietário ou consultor atribuído. As agregações são sujeitas às mesmas regras de acesso. Gestores seguem a permissão existente.

Os rascunhos locais novos usam uma chave por UID. Rascunhos legados com `ownerSdrId` igual ao UID autenticado são copiados uma vez para essa chave; o armazenamento legado fica intacto. Rascunhos legados sem proprietário identificado permanecem guardados no navegador, mas não são exibidos automaticamente a outra conta. A inicialização da SDR limpa listeners, cache de páginas e estado ao detectar troca direta de UID.

## Instrumentação local e estimativas

Em `localhost` ou `127.0.0.1`, executar `window.sdrDevResetReadStats()` antes da ação e `window.sdrDevReadStats()` depois. O objeto registra consultas iniciadas por operação, eventos de snapshot, documentos entregues ao SDK, acertos do cache e listeners ativos/pico. Não registra nomes ou conteúdo dos leads. **Documentos entregues não são uma medição de leituras faturadas**: o cache local, reconexões e entradas de índice alteram a cobrança.

| Ação | Consultas estimadas iniciadas | Documentos entregues, limite inicial |
| --- | ---: | ---: |
| Abrir carteira | 1 perfil + 1 página + 1 notificação + 1 total + 5 indicadores | perfil 0–1, página até 11, notificações até 100; agregações retornam contagens, sem documentos de lead. |
| Próxima página sem filtro | 1 listener limitado; total em cache | até 11. |
| Digitação | 0 antes de 250 ms de pausa; depois, até 200 documentos por busca concluída ou interrompida | até 200 por termo processado; busca anterior pode já ter enviado uma requisição antes de ser descartada. |
| Filtro que exige varredura | até 200 documentos por operação | até 200; uma busca incompleta é sinalizada. |
| Voltar a página filtrada em até 10 s | 0 consulta quando o cache é válido | 0; após 10 s, nova consulta limitada. |
| Abrir cadastro | até 2 listeners (catálogo e regras) + 1 API de usuários atribuíveis | catálogo até 200 e regras até 200; a API tem custo próprio não medido pelo frontend. |
| Abrir indicadores | até 10 agregações adicionais, pois 5 essenciais já foram buscadas | nenhuma lista de leads. |

Esses valores são **estimativas do código**, não medições do projeto real. A medição com contas autorizadas e índices ativos permanece pendente.
