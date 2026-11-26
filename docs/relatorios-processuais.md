# Gerador de Relatórios Processuais sem chave de IA

O módulo funciona no próprio navegador, seguindo o fluxo do gerador de documentos existente: extrair dados, conferir, editar e baixar. Não exige chave de IA, assinatura ou serviço de geração cobrado por uso. Não envia textos, imagens ou PDFs a provedores de IA. O login do sistema existente é preservado.

## Funcionamento

1. Cole o texto processual, selecione PNG/JPG/PDF, arraste arquivos ou cole um print com Ctrl+V.
2. Clique em **Gerar relatório**. Textos são organizados por regras, PDFs textuais são lidos com PDF.js e imagens/PDFs digitalizados passam por OCR Tesseract em português no navegador.
3. Confira identificação, datas, movimentos e alertas. O texto extraído fica disponível em **Conferir texto extraído das fontes**. Edite os campos e o conteúdo quando necessário.
4. Marque a conferência e baixe PDF, Word, ambos ou PDF com cópia da mensagem. Não há envio automático pelo WhatsApp.
5. Use **Próximo cliente** para cancelar leituras pendentes e limpar os dados, anexos, relatório, mensagem e textos extraídos. O detalhamento e o papel timbrado são preservados.

O campo **Observações para o relatório** acrescenta o texto revisado pelo operador ao status. Ele não é um prompt. **Organizar espaçamentos** ajusta somente espaços e quebras; não reescreve nem interpreta juridicamente o conteúdo.

## Extração e limites

A função já existente `extractAdmProcessSummary` passou a usar o módulo compartilhado `src/lib/processSummary.js`, com as mesmas regras de separação dos campos. O novo `report-local.js` reutiliza essa função, organiza eventos datados, elimina duplicatas e sinaliza conflitos. Distribuição não é presumida como autuação, e expedição de intimação não gera cálculo de prazo. Próximas etapas aparecem somente se expressamente fornecidas.

Não há interpretação generativa de decisões ou reescrita livre por IA. As informações reconhecidas são transcritas e organizadas no template institucional. Campos não identificados ficam omitidos no documento, com avisos para revisão. OCR pode errar nomes, números e datas; sempre confira o original. Processos diferentes ou nomes de clientes distintos nas fontes bloqueiam a geração até a separação ou conferência dos anexos.

São permitidos 8 arquivos, até 10 MB por arquivo e 30 MB no total. Cada PDF pode conter até 30 páginas, com 60 páginas no atendimento. Imagens podem ter até 24 megapixels. O total de texto é limitado a 60 mil caracteres e 150 registros; o exportador admite até 40 páginas. Limites evitam sobrecarregar o navegador e são informados sem omissão silenciosa de páginas.

**Resumido** apresenta as cinco movimentações datadas mais recentes e as sem data, informando o recorte no texto. **Completo** inclui todos os registros. **Detalhado** acrescenta a fonte de cada registro. A escolha não altera os dados guardados no editor.

## Documentos e papel timbrado

O PNG original do Google Drive foi incorporado sem reconstrução em `assets/process-reports/papel-timbrado.png`. Fonte: https://drive.google.com/file/d/1zf0emmW62eDL6gp5sahNyQV79FFFITbk/view . O original mede 1545 × 2000 pixels e é encaixado proporcionalmente na página A4, preservando cabeçalho, marca d'água e rodapé. Também há importação manual do PNG institucional.

PDF e DOCX usam o mesmo conteúdo e paginação. O PDF contém texto selecionável; a prévia A4 usa as mesmas coordenadas em SVG, com páginas e zoom. O DOCX é ZIP OOXML válido com texto editável, papel timbrado ancorado no cabeçalho atrás do texto em todas as páginas e numeração no rodapé. Helvetica no PDF e Arial no Word têm métricas próximas; alterações posteriores no Word podem mudar a paginação. A conferência visual final no Word da operação continua recomendada.

## Segurança e configuração

Nenhuma variável de IA é necessária. A rota `/api/process-reports`, o gateway Gemini e as variáveis `PROCESS_REPORT_GEMINI_API_KEY` e `PROCESS_REPORT_MODEL` foram removidos desta implementação. Outros módulos existentes, inclusive o assistente do sistema, não são alterados por essa mudança.

Os leitores são bibliotecas e modelos abertos incluídos em `assets/vendor/process-reports/`, carregados do mesmo site sob demanda; não dependem de CDN na execução. Versões e licenças estão no NOTICE desse diretório. O primeiro uso de OCR pode demorar mais para carregar o motor local. A velocidade depende do computador e da legibilidade dos arquivos.

Anexos, texto e rascunhos ficam somente em memória. Não há tabelas, migrações, histórico automático ou arquivos de clientes em diretórios públicos. O armazenamento local guarda apenas preferências e o timbrado institucional. Não há cadastro de processos por número ou histórico institucional de relatórios equivalente identificado no projeto; não são criados clientes nem vínculos por aproximação de nome.

## Arquivos

- Integração e navegação: `index.html` e `package.json`.
- Parser compartilhado com o gerador atual: `src/lib/processSummary.js`.
- Gerador e validação: `src/process-reports/report-local.js` e `report-core.js`.
- OCR e leitura de PDF: `src/process-reports/source-reader.js` e recursos locais em `assets/vendor/process-reports/`.
- Interface: `src/process-reports/process-reports.js` e `process-reports.css`.
- Exportações: `src/process-reports/report-export.js` e PNG institucional.
- Validação: `tests/process-reports.test.mjs` e `tests/process-reports-ui.mjs`.

## Testes

`npm run test:process-reports` verifica extração local, campos, conflitos, datas, informações incompletas, detalhamento, mensagem, isolamento e exportações de uma e várias páginas. `node tests/process-reports-ui.mjs` requer Playwright e um Chromium de QA; `PROCESS_REPORT_BROWSER_CHANNEL=msedge` usa Edge em sessão isolada. O teste de navegador usa OCR real de PNG/JPG e PDF digitalizado, leitura real de PDF textual, downloads, edição, colagem, arraste, limpeza e responsividade. Também verifica ausência de uploads POST e de solicitações HTTP a outros domínios. Todos os dados são fictícios.

Não há lint ou build configurados no projeto. Os recursos do leitor são distribuições estáticas e não acrescentam dependências de produção ao package.json. O teste legado que consulta uma planilha real de clientes fica fora da validação com dados fictícios.
