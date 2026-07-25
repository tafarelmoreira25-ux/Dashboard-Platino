param(
    [Parameter(Mandatory = $true)]
    [string]$PdfPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,
    [int]$Dpi = 144
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.CreationCollisionOption, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]

$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' }

function Wait-WinRtOperation {
    param(
        [Parameter(Mandatory = $true)]$Operation,
        [Parameter(Mandatory = $true)][Type]$ResultType
    )

    $method = $asTaskMethods |
        Where-Object {
            $_.IsGenericMethodDefinition -and
            $_.GetGenericArguments().Count -eq 1 -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        } |
        Select-Object -First 1

    $generic = $method.MakeGenericMethod($ResultType)
    $task = $generic.Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Wait-WinRtAction {
    param([Parameter(Mandatory = $true)]$Action)

    $method = $asTaskMethods |
        Where-Object {
            -not $_.IsGenericMethodDefinition -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
        } |
        Select-Object -First 1
    $task = $method.Invoke($null, @($Action))
    $task.Wait()
}

$resolvedPdf = (Resolve-Path -LiteralPath $PdfPath).Path
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path

$storageFile = Wait-WinRtOperation `
    ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPdf)) `
    ([Windows.Storage.StorageFile])
$pdf = Wait-WinRtOperation `
    ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) `
    ([Windows.Data.Pdf.PdfDocument])
$folder = Wait-WinRtOperation `
    ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($resolvedOutput)) `
    ([Windows.Storage.StorageFolder])

$scale = $Dpi / 96.0
for ($index = 0; $index -lt $pdf.PageCount; $index++) {
    $page = $pdf.GetPage($index)
    try {
        $outputFile = Wait-WinRtOperation `
            ($folder.CreateFileAsync(
                ('page-{0:D2}.png' -f ($index + 1)),
                [Windows.Storage.CreationCollisionOption]::ReplaceExisting
            )) `
            ([Windows.Storage.StorageFile])
        $stream = Wait-WinRtOperation `
            ($outputFile.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) `
            ([Windows.Storage.Streams.IRandomAccessStream])
        try {
            $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
            $options.DestinationWidth = [uint32][math]::Round($page.Size.Width * $scale)
            $options.DestinationHeight = [uint32][math]::Round($page.Size.Height * $scale)
            Wait-WinRtAction ($page.RenderToStreamAsync($stream, $options))
            $stream.FlushAsync() | Out-Null
        } finally {
            $stream.Dispose()
        }
    } finally {
        $page.Dispose()
    }
}

Get-ChildItem -LiteralPath $resolvedOutput -Filter 'page-*.png' |
    Sort-Object Name |
    Select-Object Name, Length
