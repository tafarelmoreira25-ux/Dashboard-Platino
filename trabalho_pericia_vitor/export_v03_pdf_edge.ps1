param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Contabil_Multiprofissional_V03')
)

$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edge)) { throw 'Microsoft Edge não localizado.' }
$package = (Resolve-Path -LiteralPath $PackageDir).Path
$profile = Join-Path ([System.IO.Path]::GetTempPath()) ('codex-multiprofissional-v03-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $profile)

try {
  $jobs = @(
    @('modelo_v03_source.html', '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.pdf'),
    @('manual_v03_source.html', '02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.pdf')
  )
  foreach ($job in $jobs) {
    $html = (Resolve-Path -LiteralPath (Join-Path $package $job[0])).Path
    $pdf = Join-Path $package $job[1]
    $uri = (New-Object System.Uri($html)).AbsoluteUri
    $arguments = @(
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--no-pdf-header-footer',
      "--user-data-dir=$profile",
      "--print-to-pdf=$pdf",
      $uri
    )
    $process = Start-Process -FilePath $edge -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Falha no Edge ao exportar $($job[0]): $($process.ExitCode)" }
    if (-not (Test-Path -LiteralPath $pdf)) { throw "PDF não gerado: $pdf" }
  }
}
finally {
  $resolvedTemp = [System.IO.Path]::GetFullPath($profile)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}

Get-ChildItem -LiteralPath $package -Filter '*.pdf' |
  Select-Object FullName, Length, LastWriteTime
