# Relatório de revisão — V01 para V02

O material V01 foi integralmente inventariado: modelo DOCX/PDF, manual DOCX/PDF, JSON, prompt, planilha, CSV e manifesto. O modelo continha 285 tokens e o CSV os mapeava integralmente. A arquitetura geral era boa, mas a homologação profissional exigia correções.

## Correções materiais

1. “PARECER TÉCNICO-CONTÁBIL” foi substituído por “PARECER TÉCNICO CONTÁBIL”.
2. As funções foram alinhadas a perito do juízo, perito arbitral, perito oficial e assistente técnico.
3. Laudo arbitral e laudo oficial receberam roteamento explícito.
4. CNPC passou a ser opcional e nunca inferido; CRC e certidão válida permanecem controlados.
5. O template final deixou de exibir instruções ao operador, opções de título e checklists internos.
6. O arquivo de caso passou a ser um JSON Schema Draft 2020-12 válido, separado da especificação operacional.
7. Os controles foram unificados em CHK-001 a CHK-015.
8. A memória Price foi separada em taxa declarada/prestação teórica e prestação contratual/taxa implícita.
9. As tolerâncias monetárias, de solver e equivalência de taxas foram desambiguadas.
10. Divergência de prestação passou a considerar a precisão declarada da taxa.
11. O CET passou a exigir confirmação do escopo da Resolução CMN 4.881/2020; fora dele, usa-se rótulo econômico.
12. A série BCB 20772 foi corrigida para recursos direcionados.
13. O caso de aceite foi corrigido para taxa implícita anual de aproximadamente 64,0151600471% a.a.
14. Minuta interna e emissão foram separadas: certidão pendente não impede minuta claramente marcada, mas bloqueia aprovação, assinatura e publicação.
15. Tokens numerados foram substituídos por campos escalares e sentinelas de linhas dinâmicas.

## Conclusão

A V02 é uma especificação coerente para implantação e homologação. Ela não transforma automaticamente dados não confirmados em conclusão profissional: o Perito Vitor continua responsável pela escolha do objeto, escopo, método, fontes, série comparável, respostas, conclusão e assinatura.
