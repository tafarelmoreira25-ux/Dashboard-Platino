# Layout compartilhado do Platino Workspace

## Arquitetura e causas corrigidas

O projeto usa HTML, JavaScript modular e Tailwind via CDN, sem React ou outro framework de componentes. `index.html` contém o shell e a navegação por `navigateTo`, alternando as seções existentes. O SDR tem renderizadores próprios em `src/sdr/sdr-module.js`. Firebase mantém autenticação, permissões e persistência; as APIs e a integração com planilhas foram preservadas.

O menu ocupava uma coluna do layout e a área principal recebia também uma margem de 16rem. A margem e a largura compensatória foram removidas. O shell agora usa Grid com uma coluna de 240px e outra `minmax(0, 1fr)`. Cabeçalho, conteúdo e menu têm rolagem e alturas definidas, sem escala para ajustar a interface.

O reset não estratificado do Tailwind também prevalecia sobre os componentes na camada `platino-legacy`, apagando bordas, espaçamentos e tipografia. O preflight foi desativado nas páginas que usam Tailwind e substituído por uma camada de reset explicitamente anterior aos componentes. Os tokens e padrões visuais permanecem centralizados em `src/styles/workspace.css`.

## Escopo revisado

- Início: apresentação oficial de sete páginas ocupando toda a largura disponível. Por solicitação posterior, os blocos de ações rápidas, prioridades, indicadores, próximo passo e os selos decorativos do rodapé foram removidos. O PDF, a sequência e a reprodução foram preservados.
- Meu Workspace: perfil, foco, demandas, compromissos e metas.
- Central de vendas: ranking, períodos, indicadores, equipe e materiais de apoio.
- Comercial, Administrativo e Jurídico: cabeçalhos e accordions, incluindo expansão e recolhimento.
- SDR: carteira, cadastro, perfil, contrato, análise, documento, aceite, encaminhamento, leads recebidos e configurações.
- RH, Financeiro, Drive, Treinamentos, Gestão de Contas e Hub de Sugestões.
- Páginas auxiliares: `apresentacao_platino.html`, `abertura-de-grupos.html` e `treinamento-trilho-revisao-contratos.html`, incluindo todos os slides.

O script `src/workspace-shell.js` trata somente da apresentação: foco do drawer móvel, Escape, isolamento do menu fechado, rótulos associados aos campos e contêineres de rolagem para tabelas extensas. Não altera permissões ou regras de negócio.

O assistente mantém o botão circular flutuante com a logomarca no canto inferior direito, conforme a preferência atual. O mesmo chat, foco e comportamento de abertura e fechamento foram preservados.

## Validação

O teste `tests/workspace-layout-browser-test.mjs` usa Chrome/Playwright, o HTML real e os renderizadores reais. As APIs e o Firebase ficam bloqueados; os estados do SDR são exercitados com dados locais de teste. Não há gravações no sistema real.

Foram verificadas 275 combinações de tela/estado e largura: 1440, 1280, 1024, 768 e 390px. O teste verifica a posição da área principal, ausência de rolagem horizontal da página e do conteúdo, navegação móvel, Escape, accordions e rolagem contida de tabelas. As capturas e o relatório JSON ficam em `tmp/layout-qa/`, ignorado pelo Git. As capturas principais foram inspecionadas visualmente.

Passaram também os testes de redesign, apresentação institucional, segurança do login, campanha, avisos, persistência de chargebacks, ranking, interface SDR e remoção da interface de documentos. A leitura da planilha Hunter foi validada com acesso à rede.

Limitações: o teste de núcleo SDR importa `firebase-admin`, dependência declarada mas ausente nesta instalação, e não pôde ser executado. Os fluxos autenticados do Firebase não foram testados ao vivo. As capturas usam a fonte alternativa do sistema; fontes e ícones remotos não estavam disponíveis no ambiente de automação. A família de ícones existente foi preservada no código.

Para repetir o teste de navegador, inicie um servidor estático local e configure `LAYOUT_TEST_URL`, `PLAYWRIGHT_MODULE` e `CHROME_PATH` conforme o ambiente. Uma cópia temporária de `tailwind-runtime.js` em `tmp/layout-qa/` permite executar a verificação sem depender do CDN durante o teste.

Não houve deploy nem alteração do PDF original.
