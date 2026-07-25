param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Vitor_V02'),
  [string]$ZipPath = (Join-Path $PSScriptRoot 'Pacote_Profissional_Pericia_Contabil_Vitor_V02.zip')
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$selected = @(
  '00_LEIA-ME_Pacote_Pericial_Vitor_V02.txt',
  '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.docx',
  '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.pdf',
  '02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.docx',
  '02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.pdf',
  '03_Schema_Caso_Pericial_Vitor_V02.json',
  '04_Especificacao_Comandos_Controles_Vitor_V02.json',
  '05_Prompt_Mestre_Gerador_Pericial_Vitor_V02.txt',
  '06_Mapeamento_Tokens_Modelo_Vitor_V02.csv',
  '07_Relatorio_Revisao_V01_para_V02.md',
  '08_Nota_Calculadora_V01_Nao_Homologada.txt'
)

foreach ($name in $selected) {
  if (-not (Test-Path -LiteralPath (Join-Path $package $name))) {
    throw "Arquivo ausente: $name"
  }
}

$schema = Get-Content -LiteralPath (Join-Path $package '03_Schema_Caso_Pericial_Vitor_V02.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$spec = Get-Content -LiteralPath (Join-Path $package '04_Especificacao_Comandos_Controles_Vitor_V02.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($schema.'$schema' -ne 'https://json-schema.org/draft/2020-12/schema') { throw 'Meta-schema inesperado.' }
$commandCount = @($spec.commands.PSObject.Properties | ForEach-Object { $_ }).Count
if ($commandCount -ne 21) { throw "Quantidade de comandos diferente de 21: $commandCount." }
if ($spec.controls.Count -ne 15) { throw 'Quantidade de controles diferente de 15.' }
$expectedIds = 1..15 | ForEach-Object { 'CHK-{0:D3}' -f $_ }
if (($spec.controls.id -join '|') -ne ($expectedIds -join '|')) { throw 'Sequência de controles inválida.' }

$map = Import-Csv -LiteralPath (Join-Path $package '06_Mapeamento_Tokens_Modelo_Vitor_V02.csv')
$html = Get-Content -LiteralPath (Join-Path $package 'modelo_v02_source.html') -Raw -Encoding UTF8
$modelTokens = @([regex]::Matches($html, '\{\{[A-Z0-9_]+\}\}') | ForEach-Object Value | Sort-Object -Unique)
$mapTokens = @($map.token | Sort-Object -Unique)
if ($map.Count -ne 86 -or $modelTokens.Count -ne 86 -or $mapTokens.Count -ne 86) { throw 'Quantidade de tokens diferente de 86.' }
if (@($mapTokens | Where-Object { $_ -notin $modelTokens }).Count -ne 0) { throw 'Token do mapa ausente no modelo.' }
if (@($modelTokens | Where-Object { $_ -notin $mapTokens }).Count -ne 0) { throw 'Token do modelo ausente no mapa.' }
if ($html -match '(?i)parecer técnico-contábil') { throw 'Terminologia antiga localizada no modelo.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$docxPath = Join-Path $package '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.docx'
$docxArchive = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
try {
  $entry = $docxArchive.GetEntry('word/document.xml')
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { $docxXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $docxArchive.Dispose() }
$docxTokens = @([regex]::Matches($docxXml, '\{\{[A-Z0-9_]+\}\}') | ForEach-Object Value | Sort-Object -Unique)
if ($docxTokens.Count -ne 86) { throw "DOCX contém $($docxTokens.Count) tokens únicos; esperado: 86." }

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
if ([math]::Abs($implicitMonthly - [double]$case.expected.implicit_monthly_rate) -gt 0.000000000001) {
  throw 'Taxa implícita mensal do caso de aceite não reproduzida.'
}
if ([math]::Abs($implicitAnnual - [double]$case.expected.implicit_annual_effective_rate) -gt 0.000000000001) {
  throw 'Taxa implícita anual do caso de aceite não reproduzida.'
}

foreach ($pdf in Get-ChildItem -LiteralPath $package -Filter '*.pdf') {
  if ($pdf.Length -lt 10000) { throw "PDF inválido ou vazio: $($pdf.Name)" }
}

$manifestPath = Join-Path $package '99_MANIFESTO_SHA256.txt'
$manifestLines = @(
  'MANIFESTO SHA-256 — PACOTE PERICIAL VITOR V02',
  'Gerado em 25/07/2026',
  'O manifesto não inclui o próprio arquivo 99_MANIFESTO_SHA256.txt.',
  ''
)
foreach ($name in $selected) {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $package $name)).Hash.ToLowerInvariant()
  $manifestLines += "$hash  $name"
}
[System.IO.File]::WriteAllLines($manifestPath, $manifestLines, [System.Text.UTF8Encoding]::new($false))

$zipFull = [System.IO.Path]::GetFullPath($ZipPath)
$workspace = [System.IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
if (-not $zipFull.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "ZIP fora do workspace: $zipFull"
}
if (Test-Path -LiteralPath $zipFull) { Remove-Item -LiteralPath $zipFull -Force }
$archiveFiles = @($selected | ForEach-Object { Join-Path $package $_ }) + $manifestPath
Compress-Archive -LiteralPath $archiveFiles -DestinationPath $zipFull -CompressionLevel Optimal

[pscustomobject]@{
  Schema = $schema.'$schema'
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
