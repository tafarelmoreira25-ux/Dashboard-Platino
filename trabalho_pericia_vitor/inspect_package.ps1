param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntryText {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryName
    )
    $entry = $Archive.GetEntry($EntryName)
    if ($null -eq $entry) { return $null }
    $stream = $entry.Open()
    try {
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true)
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally {
        $stream.Dispose()
    }
}

function Get-DocxInspection {
    param([string]$Path)

    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $xmlText = Read-ZipEntryText -Archive $archive -EntryName 'word/document.xml'
        [xml]$xml = $xmlText
        $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
        $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

        $lines = [System.Collections.Generic.List[string]]::new()
        foreach ($node in $xml.SelectNodes('//w:body/*', $ns)) {
            if ($node.LocalName -eq 'p') {
                $texts = $node.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.'#text' }
                $line = ($texts -join '')
                if (-not [string]::IsNullOrWhiteSpace($line)) { $lines.Add($line) }
            } elseif ($node.LocalName -eq 'tbl') {
                $lines.Add('[TABELA]')
                foreach ($row in $node.SelectNodes('./w:tr', $ns)) {
                    $cells = foreach ($cell in $row.SelectNodes('./w:tc', $ns)) {
                        (($cell.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.'#text' }) -join '')
                    }
                    $lines.Add(($cells -join ' | '))
                }
                $lines.Add('[/TABELA]')
            }
        }

        $headerFooter = [System.Collections.Generic.List[string]]::new()
        foreach ($entry in $archive.Entries | Where-Object { $_.FullName -match '^word/(header|footer)\d+\.xml$' }) {
            [xml]$part = Read-ZipEntryText -Archive $archive -EntryName $entry.FullName
            $partNs = [System.Xml.XmlNamespaceManager]::new($part.NameTable)
            $partNs.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
            $text = (($part.SelectNodes('//w:t', $partNs) | ForEach-Object { $_.'#text' }) -join ' | ')
            $headerFooter.Add("$($entry.FullName): $text")
        }

        $allText = ($lines -join "`n")
        $tokens = [regex]::Matches($allText, '\{\{[A-Z0-9_]+\}\}') |
            ForEach-Object { $_.Value } |
            Sort-Object -Unique

        return [ordered]@{
            file = [System.IO.Path]::GetFileName($Path)
            paragraphs_and_rows = $lines
            headers_footers = $headerFooter
            token_count_unique = @($tokens).Count
            tokens = @($tokens)
            table_count = $xml.SelectNodes('//w:tbl', $ns).Count
            paragraph_count = $xml.SelectNodes('//w:p', $ns).Count
        }
    } finally {
        $archive.Dispose()
    }
}

function Get-XlsxInspection {
    param([string]$Path)

    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $sharedStrings = @()
        $sharedText = Read-ZipEntryText -Archive $archive -EntryName 'xl/sharedStrings.xml'
        if ($sharedText) {
            [xml]$ss = $sharedText
            $ssNs = [System.Xml.XmlNamespaceManager]::new($ss.NameTable)
            $ssNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
            $sharedStrings = @(
                foreach ($si in $ss.SelectNodes('//m:si', $ssNs)) {
                    (($si.SelectNodes('.//m:t', $ssNs) | ForEach-Object { $_.'#text' }) -join '')
                }
            )
        }

        [xml]$workbook = Read-ZipEntryText -Archive $archive -EntryName 'xl/workbook.xml'
        $wbNs = [System.Xml.XmlNamespaceManager]::new($workbook.NameTable)
        $wbNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        $wbNs.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')

        [xml]$rels = Read-ZipEntryText -Archive $archive -EntryName 'xl/_rels/workbook.xml.rels'
        $relNs = [System.Xml.XmlNamespaceManager]::new($rels.NameTable)
        $relNs.AddNamespace('p', 'http://schemas.openxmlformats.org/package/2006/relationships')
        $relMap = @{}
        foreach ($rel in $rels.SelectNodes('//p:Relationship', $relNs)) {
            $relMap[$rel.Id] = $rel.Target
        }

        $sheetReports = [System.Collections.Generic.List[object]]::new()
        foreach ($sheet in $workbook.SelectNodes('//m:sheets/m:sheet', $wbNs)) {
            $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            $target = $relMap[$relationshipId].Replace('\', '/')
            if ($target.StartsWith('/')) {
                $entryName = $target.TrimStart('/')
            } elseif ($target.StartsWith('xl/')) {
                $entryName = $target
            } else {
                $entryName = "xl/$target"
            }
            [xml]$sheetXml = Read-ZipEntryText -Archive $archive -EntryName $entryName
            $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
            $sheetNs.AddNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
            $cells = [System.Collections.Generic.List[object]]::new()
            foreach ($cell in $sheetXml.SelectNodes('//m:sheetData/m:row/m:c', $sheetNs)) {
                $ref = $cell.r
                $type = $cell.t
                $formulaNode = $cell.SelectSingleNode('./m:f', $sheetNs)
                $valueNode = $cell.SelectSingleNode('./m:v', $sheetNs)
                $inlineNode = $cell.SelectSingleNode('./m:is', $sheetNs)
                $raw = if ($valueNode) { $valueNode.InnerText } else { $null }
                $value = $raw
                if ($type -eq 's' -and $null -ne $raw -and $raw -ne '') {
                    $index = [int]$raw
                    if ($index -lt $sharedStrings.Count) { $value = $sharedStrings[$index] }
                } elseif ($type -eq 'inlineStr' -and $inlineNode) {
                    $value = (($inlineNode.SelectNodes('.//m:t', $sheetNs) | ForEach-Object { $_.'#text' }) -join '')
                } elseif ($type -eq 'b') {
                    $value = ($raw -eq '1')
                }
                if ($null -ne $formulaNode -or -not [string]::IsNullOrWhiteSpace([string]$value)) {
                    $cells.Add([ordered]@{
                        ref = $ref
                        type = $type
                        style = $cell.s
                        formula = if ($formulaNode) { $formulaNode.InnerText } else { $null }
                        cached_value = $value
                    })
                }
            }
            $dimension = $sheetXml.SelectSingleNode('//m:dimension', $sheetNs)
            $sheetReports.Add([ordered]@{
                name = $sheet.name
                state = $sheet.state
                dimension = if ($dimension) { $dimension.ref } else { $null }
                cell_count = $cells.Count
                formula_count = @($cells | Where-Object { $_.formula }).Count
                cells = $cells
            })
        }

        return [ordered]@{
            file = [System.IO.Path]::GetFileName($Path)
            sheets = $sheetReports
            defined_names = @(
                foreach ($name in $workbook.SelectNodes('//m:definedNames/m:definedName', $wbNs)) {
                    [ordered]@{ name = $name.name; value = $name.InnerText; localSheetId = $name.localSheetId }
                }
            )
        }
    } finally {
        $archive.Dispose()
    }
}

$modelPath = Join-Path $PackageDirectory '01_Modelo_Profissional_Laudo_Parecer_Vitor_V01.docx'
$manualPath = Join-Path $PackageDirectory '02_Manual_Integral_Implementacao_Motor_Pericial_V01.docx'
$xlsxPath = Join-Path $PackageDirectory '05_Calculadora_Referencia_Motor_Pericial_V01.xlsx'
$csvPath = Join-Path $PackageDirectory '06_Mapeamento_Tokens_Modelo_V01.csv'
$jsonPath = Join-Path $PackageDirectory '03_Especificacao_JSON_Comandos_Motor_Pericial_V01.json'

$model = Get-DocxInspection -Path $modelPath
$manual = Get-DocxInspection -Path $manualPath
$workbook = Get-XlsxInspection -Path $xlsxPath
$mapping = Import-Csv -LiteralPath $csvPath -Encoding UTF8
$specification = Get-Content -Raw -LiteralPath $jsonPath -Encoding UTF8 | ConvertFrom-Json

$mappedTokens = @($mapping | ForEach-Object { $_.token } | Sort-Object -Unique)
$modelTokens = @($model.tokens)

$report = [ordered]@{
    generated_at = (Get-Date).ToString('o')
    model = $model
    manual = $manual
    workbook = $workbook
    mapping_summary = [ordered]@{
        row_count = @($mapping).Count
        unique_token_count = @($mappedTokens).Count
        duplicate_tokens = @(
            $mapping |
                Group-Object token |
                Where-Object Count -gt 1 |
                ForEach-Object { [ordered]@{ token = $_.Name; count = $_.Count } }
        )
        model_tokens_missing_from_mapping = @($modelTokens | Where-Object { $_ -notin $mappedTokens })
        mapped_tokens_not_in_model = @($mappedTokens | Where-Object { $_ -notin $modelTokens })
        invalid_paths = @(
            $mapping |
                Where-Object { [string]::IsNullOrWhiteSpace($_.caminho_sugerido_sistema) } |
                ForEach-Object { $_.token }
        )
    }
    specification_summary = [ordered]@{
        schema_version = $specification.schema_version
        top_level_properties = @($specification.PSObject.Properties.Name)
        document_types = @($specification.document_types.PSObject.Properties.Name)
        roles = @($specification.roles.PSObject.Properties.Name)
        states = @($specification.states.PSObject.Properties.Name)
        controls_count = @($specification.controls).Count
        commands_count = @($specification.commands.PSObject.Properties.Name).Count
        acceptance_cases_count = @($specification.acceptance_cases).Count
    }
}

$outputPath = Join-Path (Split-Path -Parent $PackageDirectory) 'inspection_report.json'
[System.IO.File]::WriteAllText(
    $outputPath,
    ($report | ConvertTo-Json -Depth 100),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output $outputPath
