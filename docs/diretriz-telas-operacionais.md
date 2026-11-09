# Diretriz para telas operacionais

Novas telas operacionais não devem utilizar rolagem infinita de registros. Conteúdos distintos devem ser organizados em abas internas, e listas extensas devem utilizar paginação numerada com carregamento limitado de dados.

Sempre que a origem dos registros for o Firestore, limite a consulta no serviço e use cursores para avançar. Contagens devem usar agregações quando necessário. Antes de adicionar filtros combinados, verifique os índices exigidos e o custo das leituras.

Esta diretriz não altera automaticamente as abas já existentes.
