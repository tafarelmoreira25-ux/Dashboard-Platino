<#
Script de teste: envia POST para /api/generate-document para cada template
Salva PDFs bem-sucedidos como <template>.pdf e produz um resumo em test-results.txt
#>

$templates = @(
  'chargeback',
  'citacao-intimacao-extrajudicial',
  'citacao-judicial',
  'contestacao-taxas-email',
  'declaracao-ausencia-carteira-trabalho',
  'declaracao-hipossuficiencia',
  'declaracao-isencao-irpf',
  'notificacao-extrajudicial-platino',
  'procuracao-dra-juliane',
  'termo-ciencia-autorizacao-seguranca',
  'termo-compromisso-pagamento',
  'modelo-termo-compromisso-pagamento'
)

$summary = @()

foreach ($t in $templates) {
  Write-Output "Testando template: $t"
  $body = @{
    templateKey = $t
    data = @{
      cliente = 'Teste Automático'
      cpf = '000.000.000-00'
      dia = '10'
      mes = 'julho'
      ano = '2026'
      dataPagamento = '2026-07-10'
      valor = 'R$ 0,00'
      responsavel = 'Automação'
    }
  }

  try {
    $outFile = "${t}.pdf"
    Invoke-WebRequest -Uri http://localhost:3000/api/generate-document -Method POST -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10) -OutFile $outFile -UseBasicParsing
    Write-Output "  OK -> $outFile"
    $summary += "$t: OK -> $outFile"
  } catch {
    $errMsg = $_.Exception.Message
    # Se houver resposta com corpo JSON, tente extrair
    try {
      $resp = $_.Exception.Response
      if ($resp) {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $text = $reader.ReadToEnd(); $reader.Close()
        $errMsg = $text
      }
    } catch { }
    Write-Output "  ERRO -> $errMsg"
    $summary += "$t: ERRO -> $errMsg"
  }
}

$summary | Out-File test-results.txt -Encoding utf8
Write-Output "Testes concluídos. Veja test-results.txt e os arquivos *.pdf gerados na pasta atual."
