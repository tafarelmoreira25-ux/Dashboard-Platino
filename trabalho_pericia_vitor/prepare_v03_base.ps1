$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Pacote_Pericial_Vitor_V02')).Path
$target = Join-Path $PSScriptRoot 'Pacote_Pericial_Contabil_Multiprofissional_V03'
if (-not (Test-Path -LiteralPath $target)) {
  [void](New-Item -ItemType Directory -Path $target)
}

$copies = @{
  'modelo_v02_source.html' = 'modelo_v03_source.html'
  'manual_v02_source.html' = 'manual_v03_source.html'
  '03_Schema_Caso_Pericial_Vitor_V02.json' = '03_Schema_Caso_Pericial_Multiprofissional_V03.json'
  '04_Especificacao_Comandos_Controles_Vitor_V02.json' = '04_Especificacao_Comandos_Controles_Multiprofissional_V03.json'
  '05_Prompt_Mestre_Gerador_Pericial_Vitor_V02.txt' = '05_Prompt_Mestre_Gerador_Pericial_Multiprofissional_V03.txt'
  '06_Mapeamento_Tokens_Modelo_Vitor_V02.csv' = '06_Mapeamento_Tokens_Modelo_Multiprofissional_V03.csv'
  '07_Relatorio_Revisao_V01_para_V02.md' = '07_Relatorio_Revisao_V02_para_V03.md'
  '08_Nota_Calculadora_V01_Nao_Homologada.txt' = '08_Nota_Calculadora_V01_Nao_Homologada.txt'
}

foreach ($entry in $copies.GetEnumerator()) {
  Copy-Item -LiteralPath (Join-Path $source $entry.Key) -Destination (Join-Path $target $entry.Value) -Force
}

Get-ChildItem -LiteralPath $target -File | Select-Object Name,Length
