param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Vitor_V02'),
  [ValidateSet('all', 'model', 'manual')]
  [string]$Only = 'all'
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$jobs = @(
  @{
    Key = 'model'
    Html = 'modelo_v02_source.html'
    Docx = '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.docx'
    Pdf = '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.pdf'
    Header = 'MODELO PROFISSIONAL VITOR  •  V02'
  },
  @{
    Key = 'manual'
    Html = 'manual_v02_source.html'
    Docx = '02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.docx'
    Pdf = '02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.pdf'
    Header = 'MOTOR PERICIAL CONTÁBIL VITOR  •  MANUAL V02'
  }
)

$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  foreach ($job in $jobs) {
    if ($Only -ne 'all' -and $job.Key -ne $Only) {
      continue
    }
    $htmlPath = Join-Path $package $job.Html
    $docxPath = Join-Path $package $job.Docx
    $pdfPath = Join-Path $package $job.Pdf

    Write-Output "Abrindo $($job.Html)"
    $document = $word.Documents.Open($htmlPath, $false, $false, $false)
    try {
      $document.PageSetup.PaperSize = 7
      $document.PageSetup.TopMargin = $word.CentimetersToPoints(2.0)
      $document.PageSetup.BottomMargin = $word.CentimetersToPoints(1.8)
      $document.PageSetup.LeftMargin = $word.CentimetersToPoints(1.7)
      $document.PageSetup.RightMargin = $word.CentimetersToPoints(1.7)
      $document.PageSetup.HeaderDistance = $word.CentimetersToPoints(0.8)
      $document.PageSetup.FooterDistance = $word.CentimetersToPoints(0.8)

      foreach ($section in $document.Sections) {
        $header = $section.Headers.Item(1)
        $header.Range.Text = $job.Header
        $header.Range.Font.Name = 'Aptos'
        $header.Range.Font.Size = 8
        $header.Range.Font.Color = 6049860
        $header.Range.ParagraphFormat.Alignment = 0

        $footer = $section.Footers.Item(1)
        $footer.Range.Text = 'MINUTA NÃO ASSINADA  •  Página '
        $footer.Range.Font.Name = 'Aptos'
        $footer.Range.Font.Size = 8
        $footer.Range.Font.Color = 6049860
        $footer.Range.ParagraphFormat.Alignment = 2
        $pageRange = $footer.Range
        $pageRange.Collapse(0)
        [void]$footer.Range.Fields.Add($pageRange, 33)
      }

      Write-Output "Salvando $($job.Docx)"
      $document.SaveAs2($docxPath, 16)
      Write-Output "Exportando $($job.Pdf)"
      $document.ExportAsFixedFormat($pdfPath, 17)
      Write-Output "Concluído $($job.Key)"
    }
    finally {
      $document.Close($false)
    }
  }
}
finally {
  if ($null -ne $word) {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
  }
}

Get-ChildItem -LiteralPath $package -File |
  Where-Object { $_.Name -match '^(01|02)_.+\.(docx|pdf)$' } |
  Select-Object FullName, Length, LastWriteTime
