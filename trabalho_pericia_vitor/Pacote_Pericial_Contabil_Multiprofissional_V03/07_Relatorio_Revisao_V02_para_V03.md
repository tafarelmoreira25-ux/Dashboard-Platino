# Relatório de revisão — V02 para V03

A V03 foi adaptada para funcionar como gerador multiprofissional de documentos periciais.

## Alterações solicitadas

1. Removidos nomes fixos de profissionais.
2. O cadastro passou a aceitar um ou vários peritos responsáveis.
3. Cada profissional possui nome, categoria, CRC, função e CNPC opcional.
4. O modelo cria uma linha de identificação por profissional.
5. O modelo cria um espaço individual para assinatura e carimbo por profissional.
6. O fluxo do sistema termina em `LIBERADO_PARA_IMPRESSAO`.
7. Assinatura e carimbo são realizados fisicamente após a impressão.
8. Foram retiradas as rotinas que ultrapassavam a geração e a liberação para impressão.
9. Os avisos operacionais citados pelo solicitante foram removidos.
10. Os controles passaram a ser CHK-001 a CHK-014.
11. A ausência de documento não impede automaticamente a geração da revisão.
12. A terminologia da conclusão contratual é preservada pelo gerador.

## Resultado

O documento pode ser gerado e liberado pelo sistema. A identificação final ocorre pelos dados cadastrais, pela assinatura e pelo carimbo dos profissionais no documento impresso.
