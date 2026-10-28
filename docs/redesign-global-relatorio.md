# Redesign global — Platino Workspace

Implementação local em 28/10/2026. A identidade foi aplicada no código das 14 seções operacionais, login, componentes compartilhados e três páginas auxiliares. A homologação visual e funcional com sessões autenticadas permanece pendente; este relatório não declara essa etapa concluída.

## Arquitetura e estratégia

O projeto usa HTML e JavaScript, Tailwind via CDN, ícones Phosphor e Firebase. A navegação principal alterna seções no `index.html`; o SDR tem módulo e CSS próprios. Não foi necessário criar rotas, instalar dependências ou alterar serviços.

A análise identificou várias regras globais concorrentes, estilos específicos dos módulos e efeitos sazonais com prioridade elevada. As regras existentes foram colocadas em uma camada inferior de cascata (`platino-legacy`); suas prioridades visuais foram retiradas. A folha `src/styles/workspace.css` centraliza a apresentação e mantém a geometria e os estados funcionais existentes. As classes `hidden`, as verificações de permissão e os eventos continuam controlados pelo sistema original.

Etapas executadas:

1. Inventário das seções, páginas auxiliares, estilos e arquivos oficiais de marca.
2. Tokens de cor, espaçamento e raio; componentes de formulário, superfícies, tabelas e botões.
3. Menu lateral branco, cabeçalho compacto e acesso ao perfil pelo cabeçalho.
4. Adequações de cada módulo, incluindo conteúdo dinâmico e modais.
5. Regras para telas menores, foco visível e preferência por movimento reduzido.
6. Testes automatizados, auditoria de scripts e verificação HTTP local.

Foi preservado o arquivo oficial `assets/platino-icon.png`, já usado pela navegação.

## Cobertura por página

| Página/seção | Implementação visual |
| --- | --- |
| Início | Saudação e data existentes; remoção da decoração sazonal e mascote; acessos rápidos, tarefas e indicadores em superfícies claras. |
| Meu Workspace | Demandas em linhas brancas, urgência localizada, perfil claro, meta compacta e barra ligada ao percentual já calculado. |
| Central de Vendas | Indicadores claros de Comercial, Faturamento e Jurídico; rankings em linhas; medalhas menores; filtros selecionados em azul suave. |
| Comercial | Accordion compartilhado branco, numeração, ícone linear e botões independentes de editar/expandir. Download disponível também em telas pequenas. |
| Administrativo | Mesmo accordion compartilhado; campos, seleção de modelos e documentos no padrão global. |
| Jurídico | Mesmo accordion compartilhado, mantendo conteúdo e links dos procedimentos. |
| SDR — Qualificação | Cabeçalho branco, métricas compactas, seleção de leads azul suave, formulários, etapas, status e modal padronizados. Mantida a divisão responsiva existente entre fila e detalhes. |
| Recursos Humanos | Cabeçalho institucional, cartões uniformes, comunicados com proporção preservada e altura limitada sem recorte; painéis e modais claros. |
| Treinamentos | Remoção do banner ilustrado; biblioteca com cartões claros e ações de abertura compactas; upload preservado. |
| Drive | Superfícies claras, exemplos e modelos com fundo neutro, links e ações de copiar preservados. |
| Gestão de Contas | Campos, ações, tabelas e feedbacks abrangidos pelo sistema visual central, sem alteração dos controles de acesso. |
| Feedback e Ouvidoria | Remoção das etiquetas decorativas; campos brancos, foco azul e largura confortável. |
| Documentos | Biblioteca, filtros, seleção de modelos, etapas, resumos e ações do gerador com superfícies claras. |
| Financeiro | Seção interna também abrangida por superfícies, campos, tabelas e indicadores padronizados. |
| Login e recuperação de senha | Fundo claro e formulário institucional; campos, validação e fluxo de autenticação preservados. |
| Apresentação institucional | Paleta compartilhada aplicada à apresentação, mantendo textos e navegação dos slides. |
| Abertura de grupos | Paleta compartilhada aplicada aos slides e controles; conteúdo operacional preservado. |
| Trilho de revisão de contratos | Menu e superfícies claros, seleção azul e controles padronizados; lições e exercícios preservados. |

Também estão abrangidos: editor de ranking, editor de procedimentos, editor de comunicados, modais de RH, contas e senha, atendimento/chat, campos de feedback, carregamentos, tooltips e estados vazios.

Os arquivos ocultos `.sync-*.html` são snapshots históricos sem ligação na navegação. O servidor estático local responde 404 a esses arquivos; eles não foram alterados. PDFs, modelos documentais e imagens de comunicados não foram reformulados.

## Arquivos modificados/criados

| Arquivo | Alteração |
| --- | --- |
| `src/styles/workspace.css` | Novo sistema visual global, componentes, compatibilidade com conteúdo dinâmico e responsividade. |
| `index.html` | Ligação ao CSS central, camada legada, remoção de decoração, apresentação dos accordions, acesso ao perfil e barra da meta. |
| `src/sdr/sdr.css` | Isolamento do CSS anterior na camada legada. |
| `apresentacao_platino.html` | Ligação à identidade compartilhada e isolamento dos estilos antigos. |
| `abertura-de-grupos.html` | Ligação à identidade compartilhada e isolamento dos estilos antigos. |
| `treinamento-trilho-revisao-contratos.html` | Ligação à identidade compartilhada e isolamento dos estilos antigos. |
| `tests/isabela-campaign-test.mjs` | Expectativa da entrada operacional atualizada para a ausência de decoração promocional. |
| `tests/workspace-redesign-test.mjs` | Verificação de sintaxe, renderização e interação dos accordions, permissões e contraste. |
| `docs/redesign-global-relatorio.md` | Este relatório. |

`config.js`, APIs, regras Firebase, autenticação, integrações e geradores de documentos não foram modificados. A comparação com o Git confirmou scripts idênticos fora da apresentação dos accordions e da meta mensal. Nesses trechos, as mudanças são de marcação, acessibilidade e exibição da barra; o cálculo da meta permanece o mesmo.

## Testes e verificações

16 testes aprovados:

- `auth-login-security-test.mjs`
- `avisos-chargeback-persistence-test.mjs`
- `avisos-team-highlight-test.mjs`
- `avisos-team-update-test.mjs`
- `button-interaction-audit.mjs` — 115 botões e 8 formulários.
- `citacao-judicial-pdf-test.mjs`
- `document-download-test.mjs`
- `documents-ui-test.mjs`
- `isabela-campaign-test.mjs`
- `pdf-unicode-safety-test.mjs`
- `ranking-month-reset-test.mjs`
- `ranking-sheet-summary-test.mjs`
- `ranking-summary-source-test.mjs`
- `sdr-core-test.mjs`
- `sdr-ui-test.mjs`
- `workspace-redesign-test.mjs`

O teste do redesign executa o renderer real dos accordions com DOM isolado e verifica abertura, fechamento, troca de seção expandida, conteúdo, acesso à edição e reaplicação das permissões. Também compila os scripts inline clássicos e módulos sem iniciar integrações, e verifica contraste AA das combinações de texto principais. Essa verificação de contraste não substitui uma auditoria visual completa da aplicação.

Três testes foram executados e bloqueados pelo ambiente:

- `hunter-sheet-test.mjs`: conexão HTTPS com Google Sheets recusada (`EACCES`).
- `laudo-pericial-contabil-test.mjs`: gravação do PDF de teste existente recusada (`EPERM`).
- `sdr-analysis-pdf-test.mjs`: gravação do PDF de teste existente recusada (`EPERM`).

O servidor iniciou com `npm start`. Respostas HTTP 200 verificadas para aplicação principal, CSS global, CSS SDR, logomarca e as três páginas auxiliares. A verificação de whitespace dos arquivos modificados passou.

## Pendências para homologação

- Revisão visual em navegador real, em desktop e mobile. A skill Browser informou ausência de navegador disponível nesta sessão; não foram produzidas capturas nem aferidas posições, sobreposições ou rolagens renderizadas.
- Validação ponta a ponta com perfis autorizados: upload, edição, conclusão de demandas, formulários, CRM e administração. Os testes aprovados cobrem contratos de código e lógica; não demonstram todos os fluxos autenticados em execução.
- Reexecução dos três testes bloqueados quando houver acesso à rede e aos arquivos de saída.

As regras responsivas foram implementadas, mas dependem dessa revisão renderizada para homologação. A combinação de utilitários Tailwind e conteúdo dinâmico também deve ser conferida visualmente em cada perfil.

Nenhum deploy, commit, push, merge, migration ou alteração em banco de dados foi executado.
