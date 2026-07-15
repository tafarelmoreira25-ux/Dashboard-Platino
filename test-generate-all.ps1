<# Gera uma amostra de cada modelo e salva o resumo em output/pdf. #>

$ErrorActionPreference = 'Stop'
$outputDir = Join-Path $PSScriptRoot 'output\pdf'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

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

$sampleData = @{
  cliente = 'Maria Aparecida de Oliveira Albuquerque dos Santos'
  cpf = '123.456.789-00'
  genero = 'feminino'
  nacionalidade = 'brasileira'
  estadoCivil = 'casada'
  profissao = 'analista administrativa'
  rg = '12.345.678-9'
  orgaoExpedidor = 'SSP/SP'
  email = 'maria.aparecida@example.com'
  endereco = 'Rua das Palmeiras, 1234, apartamento 56, Jardim das Flores, São Paulo/SP'
  cep = '01234-567'
  banco = 'Banco Financeiro Nacional S.A.'
  cnpjBanco = '12.345.678/0001-90'
  enderecoBanco = 'Avenida das Nações Unidas, 15000, São Paulo/SP, CEP 04578-000'
  numeroProcesso = '1001234-56.2026.8.26.0100'
  contrato = '987654321'
  dataContrato = '10/01/2025'
  parcelaCorrigida = '1.250,00'
  reducaoParcela = '350,00'
  estorno = '4.800,00'
  reducaoTotal = '12.000,00'
  dataPagamento = '15/08/2026'
  valor = '3.500,00'
  valorExtenso = 'três mil e quinhentos reais'
  valorParcela = '1.250,00'
  valorParcelaExtenso = 'mil duzentos e cinquenta reais'
  quantidadeParcelas = '48'
  dataRepresentacao = '15/07/2026'
  seguro = '1.500,00'
  registroContrato = '350,00'
  tarifaAvaliacao = '780,00'
  tarifaCadastro = '950,00'
  demaisTarifas = '300,00'
  iof = '1.250,00'
  iofAdicional = '420,00'
  responsavel = 'Fernanda Ramos'
  servico = 'documentação e diligências necessárias à conclusão da revisão contratual'
  produto = 'documentação técnica e emissão das certidões necessárias'
  estado = 'São Paulo/SP'
  cidade = 'São Paulo'
  uf = 'SP'
  dataReclamacao = '15/07/2026'
  protocolo = '2026.0715.123456'
  data = '15/07/2026'
  dia = '15'
  mes = 'julho'
  ano = '2026'
  numeroDocumento = 'TESTE-20260715'
}

$summary = foreach ($template in $templates) {
  $body = @{ templateKey = $template; data = $sampleData } | ConvertTo-Json -Depth 10
  $outFile = Join-Path $outputDir "$template.pdf"
  try {
    Invoke-WebRequest -Uri 'http://localhost:3000/api/generate-document' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -OutFile $outFile -UseBasicParsing
    $size = (Get-Item $outFile).Length
    "$template`: OK ($size bytes)"
  } catch {
    "$template`: ERRO - $($_.Exception.Message)"
  }
}

$summary | Set-Content (Join-Path $outputDir 'test-results.txt') -Encoding utf8
$summary
