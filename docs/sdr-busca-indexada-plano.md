# SDR: segurança e preparação da busca indexada

Estado: proposta. Nenhuma migração, índice ou regra Firestore foi publicado.

## Duplicidades

A API consulta `phoneKey` e `documentKey` com Admin SDK (até cinco resultados por chave). O Admin SDK ignora as regras Firestore. A resposta de duplicidade agora contém apenas leads que o ator autenticado pode ler segundo `roleCan("lead.read", ...)`, usando o UID e o perfil verificados no servidor. Se todos os registros coincidentes estiverem fora do escopo, o cadastro prossegue com a mesma resposta de um cadastro sem coincidências; os IDs coincidentes ficam somente no registro de auditoria reservado à gestão. A interface mantém a revisão e a justificativa para coincidências autorizadas.

O limite global de cinco resultados pode deixar uma coincidência autorizada fora da primeira página de cada chave. Corrigir essa limitação exigirá consultar por chave e escopo ou paginar os resultados, com validação dos índices; não se deve aumentar uma varredura global para compensar. O limitador atual da API é por UID e em memória de instância; não deve ser considerado uma proteção distribuída contra abuso. A resposta para coincidências externas não contém um indicador observável, mas a segurança deve ser reavaliada com tráfego real antes da publicação.

## Campos e consultas propostas

Os campos `phoneKey` e `documentKey` já são derivados pela API. Esta branch prepara `fullNameKey`, `externalCodeKey` e `protocolKey` em novos cadastros e salvamentos. A busca atual por substring permanece ativa, com teto de 200 documentos por operação e aviso de incompletude. A busca nova só pode ser ligada depois do preenchimento histórico e da validação dos índices.

| Entrada | Consulta proposta | Semântica |
| --- | --- | --- |
| Nome | `fullNameKey >= prefixo` e `fullNameKey < prefixo + "\uf8ff"`, `orderBy(fullNameKey)`, cursor e `limit(pageSize + 1)` | Prefixo do nome completo, sem distinguir caixa e acentos. Não encontra sobrenome digitado isoladamente. |
| Telefone | `phoneKey == digitos` | Correspondência exata. Definir antes se o prefixo `55` será aceito/canonizado. |
| CPF/CNPJ | `documentKey == digitos` | Correspondência exata, somente a perfis que podem consultar o lead. Não retornar documento de terceiros em mensagens ou sugestões. |
| Protocolo | `protocolKey == textoNormalizado` | Correspondência exata. |
| Código externo | `externalCodeKey == textoNormalizado` | Correspondência exata. |

Todas as consultas para um usuário comum incluem `ownerSdrId == uid` ou, na vista de consultor, `assignedConsultantId == uid`; o UID vem da autenticação. Gestores seguem a permissão atual. Se houver filtros adicionais, o resultado e a contagem devem continuar exatos; não filtrar só uma página limitada no navegador. Antes de trocar o mecanismo, aprovar a mudança de semântica em relação à busca atual por substring (que também cobre banco e tipo de contrato).

Para o prefixo de nome, os índices compostos por `(ownerSdrId ASC, fullNameKey ASC)` e `(assignedConsultantId ASC, fullNameKey ASC)` são necessários nas vistas restritas. Para as igualdades exatas, avaliar a combinação dos índices automáticos antes de criar pares `escopo + chave` para telefone, documento, protocolo e código. Confirmar o plano real e erros de índice com acesso autorizado. Os nove candidatos em `docs/sdr-firestore-indexes-propostos.json` são de indicadores, não cobrem esta nova busca. Nenhum deles é instalado por `firebase.json`.

## Inventário e migração, ainda não executados

O total real de documentos `sdrLeads` e a quantidade de registros sem cada chave **não estão disponíveis**: a listagem de índices retornou HTTP 401 e não há credencial autorizada para inventariar os dados. O repositório não contém uma cópia completa do banco. A inspeção de presença de campos requer ler os documentos, pois uma contagem simples não identifica campos ausentes. O inventário deve registrar apenas contagens por campo, sem exportar nomes, telefones ou documentos pessoais.

1. Restabelecer uma sessão OAuth da conta autorizada para `platino-hub` (`firebase login --reauth`) e executar somente `firebase firestore:indexes --project platino-hub --json`. Se a autenticação passar e vier HTTP 403, solicitar permissão IAM de **listar índices**; 401 não demonstra falta de IAM.
2. Com acesso específico de leitura aos leads, medir `N` (total) por agregação e percorrer os documentos em páginas pequenas para apurar `M_nome`, `M_telefone`, `M_documento`, `M_protocolo` e `M_codigo` sem chaves. Restringir acesso e não registrar PII no log.
3. Comparar os índices existentes, aprovar apenas os ausentes e aguardar o estado pronto. Validar a busca planejada com duas contas de perfis distintos e casos sem resultado.
4. Após autorização separada para migração, atualizar em lotes de até 100 documentos, com cursor/checkpoint por ID, operação idempotente, baixa taxa de gravação e retomada. Atualizar só campos ausentes ou divergentes; preservar os demais dados. Registrar contagens, falhas e ponto de retomada. Não executar limpeza nem exclusão.
5. Verificar cobertura das chaves e igualdade de resultados esperados em amostra autorizada. Ativar a nova busca apenas após aprovação; manter a busca atual até a transição estar comprovada.

Estimativa na edição Standard: inventário de conteúdo custa aproximadamente `N` leituras de documentos; o `count()` inicial custa aproximadamente `ceil(N/1000)` leituras de índice, com mínimo de uma; o preenchimento custa até `N` leituras adicionais se não aproveitar a leitura do inventário e até `M` gravações, em que `M` é o número de documentos que realmente precisam mudar. Com inventário e atualização no mesmo percurso autorizado, é possível evitar a segunda leitura, mas o plano deve manter checkpoint seguro. O armazenamento dos novos campos e índices também cresce. Não há valor numérico honesto até obter `N` e `M` reais.

## Leituras adicionais atuais

Ao abrir a carteira, o sistema inicia cinco contagens essenciais; as dez restantes já são carregadas somente ao abrir Indicadores. As contagens pendentes são deduplicadas em memória e invalidadas após mutações. É preciso medir `count()` com Query Explain antes de reduzir ou alterar esses indicadores, preservando sua precisão.

O listener de notificações usa `limit(100)` sem ordenação no servidor e depois ordena no navegador. Além do limite alto, isso não garante que as 100 notificações carregadas sejam as mais recentes. A alternativa é uma consulta ordenada por `createdAt DESC` com limite menor e paginação ou acesso a notificações antigas; isso pode exigir índice composto `(userId, createdAt DESC)` e verificação de documentos antigos sem `createdAt`. Não alterar o listener até confirmar esses dados e o índice.
