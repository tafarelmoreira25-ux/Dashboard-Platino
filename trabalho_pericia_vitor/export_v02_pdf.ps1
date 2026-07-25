param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Vitor_V02')
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$jobs = @(
  @('01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.docx', '01_Modelo_Laudo_Parecer_Pericial_Contabil_Vitor_V02.pdf'),
  @('02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.docx', '02_Manual_Integral_Implantacao_Motor_Pericial_Vitor_V02.pdf')
)
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($job in $jobs) {
    $input = Join-Path $package $job[0]
    $output = Join-Path $package $job[1]
    $document = $word.Documents.Open($input, $false, $true)
    try {
      $document.Fields.Update() | Out-Null
      foreach ($section in $document.Sections) {
        $section.Headers.Item(1).Range.Fields.Update() | Out-Null
        $section.Footers.Item(1).Range.Fields.Update() | Out-Null
      }
      $document.Repaginate()
      $document.ExportAsFixedFormat($output, 17)
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

Get-ChildItem -LiteralPath $package -Filter '*.pdf' |
  Select-Object FullName, Length, LastWriteTime
