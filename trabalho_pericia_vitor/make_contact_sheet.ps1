param(
    [Parameter(Mandatory = $true)]
    [string]$ImageDirectory,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [int]$Columns = 4,
    [int]$ThumbWidth = 300,
    [int]$Margin = 16
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$images = @(Get-ChildItem -LiteralPath $ImageDirectory -Filter 'page-*.png' | Sort-Object Name)
if ($images.Count -eq 0) { throw 'Nenhuma imagem page-*.png encontrada.' }

$first = [System.Drawing.Image]::FromFile($images[0].FullName)
try {
    $ratio = $first.Height / $first.Width
} finally {
    $first.Dispose()
}

$thumbHeight = [int][math]::Round($ThumbWidth * $ratio)
$labelHeight = 28
$rows = [int][math]::Ceiling($images.Count / [double]$Columns)
$width = $Columns * $ThumbWidth + ($Columns + 1) * $Margin
$height = $rows * ($thumbHeight + $labelHeight) + ($rows + 1) * $Margin

$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(242, 244, 247))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $font = [System.Drawing.Font]::new('Arial', 11, [System.Drawing.FontStyle]::Bold)
    $brush = [System.Drawing.Brushes]::Black
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(190, 195, 202), 1)
    try {
        for ($i = 0; $i -lt $images.Count; $i++) {
            $column = $i % $Columns
            $row = [int][math]::Floor($i / $Columns)
            $x = $Margin + $column * ($ThumbWidth + $Margin)
            $y = $Margin + $row * ($thumbHeight + $labelHeight + $Margin)
            $image = [System.Drawing.Image]::FromFile($images[$i].FullName)
            try {
                $graphics.DrawImage($image, $x, $y, $ThumbWidth, $thumbHeight)
                $graphics.DrawRectangle($pen, $x, $y, $ThumbWidth, $thumbHeight)
                $graphics.DrawString(
                    ('Página {0}' -f ($i + 1)),
                    $font,
                    $brush,
                    [single]$x,
                    [single]($y + $thumbHeight + 4)
                )
            } finally {
                $image.Dispose()
            }
        }
    } finally {
        $font.Dispose()
        $pen.Dispose()
    }

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

Get-Item -LiteralPath $OutputPath | Select-Object FullName, Length
