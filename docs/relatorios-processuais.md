# Gerador de Relatórios Processuais

O módulo integra a navegação existente em `index.html`, sem substituir a Central de Documentos ou seus modelos. Usa JavaScript ES modules, Express local, função Node na Vercel, Firebase Auth/Admin e `pdf-lib` já existentes. Não acrescenta dependências ou migrações.

## Arquivos da implementação

Modificados: `index.html` (menu e seção), `server.mjs` (rota e limite de payload), `package.json` (comando de teste), `.env.example` (configuração do gateway) e `.gitignore` (artefatos locais de QA).

Criados: `api/process-reports.js` (API autenticada), `src/process-reports/report-core.js` (esquema, datas, template e isolamento), `report-service.js` (entrada multimodal e gateway Gemini), `report-export.js` (PDF e DOCX), `process-reports.js` (interface e editor), `process-reports.css` (layout responsivo), `assets/process-reports/papel-timbrado.png` (PNG original), `tests/process-reports.test.mjs`, `tests/process-reports-ui.mjs` e este documento.

## Configuração

Defina `PROCESS_REPORT_GEMINI_API_KEY` somente no backend e `PROCESS_REPORT_MODEL` com um modelo Gemini multimodal que aceite PDFs e JSON Schema. O padrão é `gemini-3.5-flash`, o identificador já utilizado no projeto, configurável conforme disponibilidade da conta. Nunca use prefixos de variável pública. O Firebase Admin utiliza as configurações já existentes no projeto.

A integração antiga `window.platinoGenerateAI` usa Firebase AI Logic no navegador e só expõe uma chamada textual. O novo gateway mantém o provedor Gemini e acrescenta processamento inline de múltiplos anexos, esquema JSON, autenticação e limites no servidor. Não utiliza histórico de conversas nem a Files API. A chave do gateway precisa ser configurada antes do primeiro uso real.

`POST /api/process-reports` exige Bearer Firebase e verifica o perfil ativo em `users`. O acesso segue a Central de Documentos, disponível aos usuários ativos autenticados. O payload é limitado a 4 MB no Express e a 8 anexos, 2 MB por arquivo e 2,8 MB de bytes totais; são aceitos PNG, JPEG e PDF, com verificação de assinatura. O limite menor de bytes permite o transporte base64 dentro do limite de payload da hospedagem. Há limite local de seis gerações por minuto e uma simultânea por usuário; em múltiplas instâncias esse limite não é global.

## Dados e revisão

Fontes, rascunho e arquivos permanecem em memória no navegador e na requisição ao provedor. O módulo não cria registros, histórico, tabelas ou arquivos processuais públicos. A auditoria encontrou consulta comercial por nome (`/api/consultar`) e leads SDR, mas nenhum cadastro de processos por número ou histórico institucional de relatórios equivalente para vincular. Não são criados clientes automaticamente nem feitas associações por aproximação de nome.

O JSON tem identificação, processos detectados, eventos com fonte, status, próximas etapas e alertas. A validação local rejeita formatos inválidos e múltiplos processos detectados. Textos são exibidos como texto escapado. A IA recebe regras para não inventar eventos, prazos ou resultados e tratar anexos como dados. Essas regras não substituem a conferência humana: os alertas e as fontes ficam acessíveis no editor e a exportação exige confirmação de revisão. Não há cálculo de prazo processual.

Alterar as fontes invalida o relatório para exportação. A revisão de linguagem conserva os dados de identificação. “Próximo cliente” aborta e invalida solicitações, descarta URLs temporárias e limpa texto, cliente, número, instruções, anexos, relatório e mensagem. A mesma limpeza ocorre ao sair do sistema. A preferência de detalhamento e o papel timbrado são preservados. Nenhum rascunho com dados pessoais é salvo em localStorage.

## Papel timbrado e exportação

O PNG original fornecido no Google Drive foi incorporado em `assets/process-reports/papel-timbrado.png`, sem reconstrução. Fonte: https://drive.google.com/file/d/1zf0emmW62eDL6gp5sahNyQV79FFFITbk/view . O arquivo original mede 1545 × 2000 pixels; ele é encaixado proporcionalmente na página A4, sem cortes ou distorção. As margens de texto reservam cabeçalho e rodapé. Uma substituição manual em PNG pode ser mantida neste navegador; use o arquivo oficial e confira as margens na prévia.

PDF e DOCX são gerados localmente a partir do mesmo conteúdo e paginação. O PDF contém texto vetorial selecionável. A prévia A4 usa as mesmas linhas, coordenadas, tamanhos e imagem do exportador, desenhados em SVG selecionável, com paginação e zoom; ela funciona também em navegadores sem visualizador PDF embutido. O DOCX é um pacote ZIP OOXML válido, com texto editável, cabeçalho com imagem ancorada atrás do texto em todas as páginas e rodapé com numeração. A fonte PDF é Helvetica e o Word usa Arial; a paginação é explicitada por quebras para preservar o layout. Alterações posteriores no Word podem causar reflow. Caracteres fora da codificação suportada pela fonte PDF são sinalizados para revisão em vez de serem silenciosamente removidos.

Há downloads PDF, DOCX, ambos e PDF com cópia da mensagem. “Ambos” prepara dois arquivos; navegadores podem pedir autorização para múltiplos downloads. Não há envio automático pelo WhatsApp.

## Validação

Execute `npm run test:process-reports` e os scripts existentes em `package.json`. Não há lint ou build configurados neste projeto estático. Os testes usam exclusivamente dados fictícios e provedor simulado, cobrindo texto, anexos, limites, resposta estruturada, erros, isolamento, API e exportações de uma e várias páginas. Arquivos de QA ficam em `tmp/process-reports-qa/` e não devem ser publicados.

O teste opcional `node tests/process-reports-ui.mjs` requer Playwright e um Chromium disponível no ambiente de QA. Pode-se definir `PROCESS_REPORT_BROWSER_CHANNEL=msedge` para usar Edge instalado. O teste abre uma sessão isolada, sem perfil do usuário, com autenticação e IA simuladas; ele confere também cópia de mensagem, downloads, colagem, arraste, responsividade e limpeza durante requisições pendentes.

Antes da produção, configure o segredo do gateway e faça uma geração real com fontes fictícias em ambiente autenticado, validando disponibilidade e cota do modelo. Nenhuma chamada paga ou credencial real é incluída nos testes automatizados. Abra o DOCX no Word da operação para conferir fontes e compatibilidade antes do primeiro envio.
