$ErrorActionPreference = 'Stop'
$sourceBuilder = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build_v02_openxml.ps1') -Raw -Encoding UTF8
$sourceBuilder = $sourceBuilder.Replace(
  "Pacote_Pericial_Vitor_V02",
  "Pacote_Pericial_Contabil_Multiprofissional_V03"
).Replace(
  "modelo_v02_source.html",
  "modelo_v03_source.html"
).Replace(
  "manual_v02_source.html",
  "manual_v03_source.html"
).Replace(
  "01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.docx",
  "01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.docx"
).Replace(
  "02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.docx",
  "02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.docx"
).Replace(
  "MODELO PROFISSIONAL VITOR  •  V02",
  "MODELO PERICIAL MULTIPROFISSIONAL  •  V03"
).Replace(
  "MOTOR PERICIAL CONTÁBIL VITOR  •  MANUAL V02",
  "GERADOR PERICIAL MULTIPROFISSIONAL  •  MANUAL V03"
).Replace(
  "MINUTA NÃO ASSINADA  •  Página ",
  "DOCUMENTO GERADO PELO SISTEMA  •  Página "
)
[System.IO.File]::WriteAllText(
  (Join-Path $PSScriptRoot 'build_v03_openxml.ps1'),
  $sourceBuilder,
  [System.Text.UTF8Encoding]::new($false)
)

$sourceExporter = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'export_v02_pdf_edge.ps1') -Raw -Encoding UTF8
$sourceExporter = $sourceExporter.Replace(
  "Pacote_Pericial_Vitor_V02",
  "Pacote_Pericial_Contabil_Multiprofissional_V03"
).Replace(
  "modelo_v02_source.html",
  "modelo_v03_source.html"
).Replace(
  "manual_v02_source.html",
  "manual_v03_source.html"
).Replace(
  "01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.pdf",
  "01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.pdf"
).Replace(
  "02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.pdf",
  "02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.pdf"
).Replace(
  "codex-vitor-v02-",
  "codex-multiprofissional-v03-"
)
[System.IO.File]::WriteAllText(
  (Join-Path $PSScriptRoot 'export_v03_pdf_edge.ps1'),
  $sourceExporter,
  [System.Text.UTF8Encoding]::new($false)
)

Get-Item -LiteralPath (Join-Path $PSScriptRoot 'build_v03_openxml.ps1'),
  (Join-Path $PSScriptRoot 'export_v03_pdf_edge.ps1') |
  Select-Object FullName,Length
