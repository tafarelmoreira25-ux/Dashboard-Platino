param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Contabil_Multiprofissional_V03'),
  [string]$ZipPath = (Join-Path $PSScriptRoot 'Pacote_Profissional_Pericia_Contabil_Multiprofissional_V03.zip')
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$selected = @(
  '00_LEIA-ME_Pacote_Pericial_Multiprofissional_V03.txt',
  '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.docx',
  '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.pdf',
  '02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.docx',
  '02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.pdf',
  '03_Schema_Caso_Pericial_Multiprofissional_V03.json',
  '04_Especificacao_Comandos_Controles_Multiprofissional_V03.json',
  '05_Prompt_Mestre_Gerador_Pericial_Multiprofissional_V03.txt',
  '06_Mapeamento_Tokens_Modelo_Multiprofissional_V03.csv',
  '07_Relatorio_Revisao_V02_para_V03.md',
  '08_Nota_Calculadora_V01_Nao_Homologada.txt'
)
foreach ($name in $selected) {
  if (-not (Test-Path -LiteralPath (Join-Path $package $name))) { throw "Arquivo ausente: $name" }
}

$schemaPath = Join-Path $package '03_Schema_Caso_Pericial_Multiprofissional_V03.json'
$specPath = Join-Path $package '04_Especificacao_Comandos_Controles_Multiprofissional_V03.json'
$schemaText = Get-Content -LiteralPath $schemaPath -Raw -Encoding UTF8
$specText = Get-Content -LiteralPath $specPath -Raw -Encoding UTF8
$schema = $schemaText | ConvertFrom-Json
$spec = $specText | ConvertFrom-Json
if ($schema.'$schema' -ne 'https://json-schema.org/draft/2020-12/schema') { throw 'Meta-schema inesperado.' }
if ('technical_responsibles' -notin $schema.required) { throw 'technical_responsibles não é obrigatório.' }
if ($schema.properties.PSObject.Properties.Name -contains 'professional') { throw 'Campo profissional singular ainda presente.' }
if ($schema.properties.PSObject.Properties.Name -contains 'audit') { throw 'Campo audit ainda presente.' }
$commandCount = ($spec.commands.PSObject.Properties.Name | Measure-Object).Count
if ($commandCount -ne 18) { throw "Quantidade de comandos diferente de 18: $commandCount." }
if ($spec.controls.Count -ne 14) { throw 'Quantidade de controles diferente de 14.' }
$expectedIds = 1..14 | ForEach-Object { 'CHK-{0:D3}' -f $_ }
if (($spec.controls.id -join '|') -ne ($expectedIds -join '|')) { throw 'Sequência de controles inválida.' }
if (-not $spec.commands.LIBERAR_PARA_IMPRESSAO) { throw 'Comando de liberação ausente.' }
if ($spec.commands.ASSINAR_DOCUMENTO -or $spec.commands.VALIDAR_ASSINATURA -or $spec.commands.PUBLICAR_PDF_FINAL) {
  throw 'Comando posterior à impressão ainda presente.'
}

$forbidden = '(?i)Vitor|Denis|Não preencher CNPC|impedimento|suspeição|conflito de interesses|PAdES|CERTIDAO_REGULARIDADE|VALIDAR_ASSINATURA|ASSINAR_DOCUMENTO|PUBLICAR_PDF_FINAL|HASH_PDF_APROVADO|REGRA DE INSUFICIÊNCIA DOCUMENTAL|INCONCLUSIVO_POR_DADOS|VOCABULÁRIO BLOQUEADO|DADOS_INSUFICIENTES|blocked language'
$textFiles = Get-ChildItem -LiteralPath $package -File |
  Where-Object { $_.Extension -in @('.json','.txt','.csv','.md','.html') }
foreach ($file in $textFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($content -match $forbidden) { throw "Conteúdo removido ainda presente em $($file.Name): $($Matches[0])" }
}
$promptContent = Get-Content -LiteralPath (Join-Path $package '05_Prompt_Mestre_Gerador_Pericial_Multiprofissional_V03.txt') -Raw -Encoding UTF8
foreach ($allowedExpression in @('valor incontroverso','valor a receber','autorizado pelo Banco Central')) {
  if ($promptContent -notmatch [regex]::Escape($allowedExpression)) { throw "Expressão permitida ausente do prompt: $allowedExpression" }
}

$map = Import-Csv -LiteralPath (Join-Path $package '06_Mapeamento_Tokens_Modelo_Multiprofissional_V03.csv')
$html = Get-Content -LiteralPath (Join-Path $package 'modelo_v03_source.html') -Raw -Encoding UTF8
$modelTokens = @([regex]::Matches($html, '\{\{[A-Z0-9_]+\}\}') | ForEach-Object Value | Sort-Object -Unique)
$mapTokens = @($map.token | Sort-Object -Unique)
if ($map.Count -ne 74 -or $modelTokens.Count -ne 74 -or $mapTokens.Count -ne 74) { throw 'Quantidade de tokens diferente de 74.' }
if (@(Compare-Object $mapTokens $modelTokens).Count -ne 0) { throw 'Mapa de tokens e modelo divergem.' }
foreach ($requiredToken in @('{{RESPONSAVEIS_TECNICOS_RESUMO}}','{{RESPONSAVEIS_TECNICOS_ROWS}}','{{ASSINATURAS_CARIMBOS_ROWS}}')) {
  if ($requiredToken -notin $modelTokens) { throw "Token multiprofissional ausente: $requiredToken" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$docxPath = Join-Path $package '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.docx'
$archive = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
try {
  $entry = $archive.GetEntry('word/document.xml')
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { $docxXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $archive.Dispose() }
$docxTokens = @([regex]::Matches($docxXml, '\{\{[A-Z0-9_]+\}\}') | ForEach-Object Value | Sort-Object -Unique)
if ($docxTokens.Count -ne 74) { throw "DOCX contém $($docxTokens.Count) tokens; esperado: 74." }
if ($docxXml -match $forbidden) { throw "Conteúdo removido localizado no DOCX: $($Matches[0])" }

$openXml = Get-ChildItem -Path 'C:\Program Files\Microsoft Office\root' -Filter 'DocumentFormat.OpenXml.dll' -Recurse |
  Select-Object -First 1 -ExpandProperty FullName
[void][System.Reflection.Assembly]::LoadFrom($openXml)
foreach ($docx in Get-ChildItem -LiteralPath $package -Filter '*.docx') {
  $document = [DocumentFormat.OpenXml.Packaging.WordprocessingDocument]::Open($docx.FullName, $false)
  try {
    $validator = New-Object DocumentFormat.OpenXml.Validation.OpenXmlValidator
    $errors = @($validator.Validate($document))
    if ($errors.Count -ne 0) { throw "$($docx.Name): $($errors.Count) erro(s) OpenXML." }
  } finally { $document.Dispose() }
}

$case = $spec.acceptance_cases | Where-Object case_id -eq 'ACCEPT-PRICE-CET-001'
$principal = [double]$case.input.financed_principal
$rate = [double]$case.input.periodic_rate_declared
$installments = [int]$case.input.installments
$payment = [double]$case.input.contract_payment
$theoretical = $principal * $rate / (1 - [math]::Pow(1 + $rate, -$installments))
if ([math]::Abs($theoretical - [double]$case.expected.price_theoretical_payment_at_declared_rate) -gt 0.000000001) {
  throw 'Prestação teórica do caso de aceite não reproduzida.'
}
$low = 0.0
$high = 0.2
for ($iteration = 0; $iteration -lt 300; $iteration++) {
  $mid = ($low + $high) / 2
  $residual = $principal - $payment * (1 - [math]::Pow(1 + $mid, -$installments)) / $mid
  if ($residual -gt 0) { $high = $mid } else { $low = $mid }
}
$implicitMonthly = ($low + $high) / 2
$implicitAnnual = [math]::Pow(1 + $implicitMonthly, 12) - 1
if ([math]::Abs($implicitMonthly - [double]$case.expected.implicit_monthly_rate) -gt 0.000000000001) { throw 'Taxa mensal não reproduzida.' }
if ([math]::Abs($implicitAnnual - [double]$case.expected.implicit_annual_effective_rate) -gt 0.000000000001) { throw 'Taxa anual não reproduzida.' }

foreach ($pdf in Get-ChildItem -LiteralPath $package -Filter '*.pdf') {
  if ($pdf.Length -lt 10000) { throw "PDF inválido: $($pdf.Name)" }
}

$manifestPath = Join-Path $package '99_MANIFESTO_SHA256.txt'
$manifestLines = @(
  'MANIFESTO SHA-256 — PACOTE PERICIAL MULTIPROFISSIONAL V03',
  'Gerado em 25/07/2026',
  'O manifesto não inclui o próprio arquivo.',
  ''
)
foreach ($name in $selected) {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $package $name)).Hash.ToLowerInvariant()
  $manifestLines += "$hash  $name"
}
[System.IO.File]::WriteAllLines($manifestPath, $manifestLines, [System.Text.UTF8Encoding]::new($false))

$zipFull = [System.IO.Path]::GetFullPath($ZipPath)
$workspace = [System.IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
if (-not $zipFull.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw "ZIP fora do workspace: $zipFull" }
if (Test-Path -LiteralPath $zipFull) { Remove-Item -LiteralPath $zipFull -Force }
$archiveFiles = @($selected | ForEach-Object { Join-Path $package $_ }) + $manifestPath
Compress-Archive -LiteralPath $archiveFiles -DestinationPath $zipFull -CompressionLevel Optimal

[pscustomobject]@{
  Commands = $commandCount
  Controls = $spec.controls.Count
  Tokens = $modelTokens.Count
  DocxOpenXmlErrors = 0
  TheoreticalPayment = $theoretical
  ImplicitMonthly = $implicitMonthly
  ImplicitAnnual = $implicitAnnual
  PackageFiles = $archiveFiles.Count
  ZipPath = $zipFull
  ZipBytes = (Get-Item -LiteralPath $zipFull).Length
}
