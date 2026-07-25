$ErrorActionPreference = 'Stop'
$dir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Pacote_Pericial_Contabil_Multiprofissional_V03')).Path
$schemaPath = Join-Path $dir '03_Schema_Caso_Pericial_Multiprofissional_V03.json'
$specPath = Join-Path $dir '04_Especificacao_Comandos_Controles_Multiprofissional_V03.json'

$schema = Get-Content -LiteralPath $schemaPath -Raw -Encoding UTF8 | ConvertFrom-Json
$schema.'$id' = 'https://sistema.local/schemas/caso-pericial-multiprofissional-v3.json'
$schema.title = 'Caso Pericial Contábil-Financeiro Multiprofissional - V03'
$schema.description = 'Contrato de dados do gerador pericial multiprofissional. Valores monetários e taxas são strings decimais.'
$schema.required = @($schema.required | Where-Object { $_ -notin @('professional','audit','technical_responsibles') })
$schema.required += 'technical_responsibles'
$schema.properties.PSObject.Properties.Remove('professional')
$schema.properties.PSObject.Properties.Remove('approvals')
$schema.properties.PSObject.Properties.Remove('signature')
$schema.properties.PSObject.Properties.Remove('audit')
$schema.properties.PSObject.Properties.Remove('artifacts')
$schema.properties | Add-Member -NotePropertyName technical_responsibles -NotePropertyValue ([ordered]@{
  type = 'array'
  minItems = 1
  items = [ordered]@{ '$ref' = '#/$defs/professional' }
}) -Force
$schema.'$defs'.case_state.enum = @(
  'RASCUNHO','DADOS_EXTRAIDOS','DADOS_CONFIRMADOS','CALCULADO','VALIDADO',
  'DOCUMENTO_GERADO','EM_REVISAO','LIBERADO_PARA_IMPRESSAO','CANCELADO'
)
$schema.'$defs'.document.properties.status.enum = @('DOCUMENTO_GERADO','LIBERADO_PARA_IMPRESSAO')
$schema.'$defs'.calculation.properties.status.enum = @(
  $schema.'$defs'.calculation.properties.status.enum |
    Where-Object { $_ -notin @('DADOS_INSUFICIENTES','EXECUTADO_COM_DADOS_DISPONIVEIS') }
) + 'EXECUTADO_COM_DADOS_DISPONIVEIS'
$schema.'$defs'.document.properties | Add-Member -NotePropertyName issue_place -NotePropertyValue ([ordered]@{type=@('string','null')}) -Force
$schema.'$defs'.document.properties | Add-Member -NotePropertyName issue_date -NotePropertyValue ([ordered]@{oneOf=@([ordered]@{'$ref'='#/$defs/date'},[ordered]@{type='null'})}) -Force
$schema.'$defs'.document.properties | Add-Member -NotePropertyName page_count -NotePropertyValue ([ordered]@{type=@('integer','null');minimum=1}) -Force
$schema.'$defs'.document.properties | Add-Member -NotePropertyName annex_count -NotePropertyValue ([ordered]@{type=@('integer','null');minimum=0}) -Force
$schema.'$defs'.professional = [ordered]@{
  type = 'object'
  additionalProperties = $false
  required = @('professional_id','name','category','crc','function')
  properties = [ordered]@{
    professional_id = [ordered]@{type='string';minLength=1}
    name = [ordered]@{type='string';minLength=1}
    category = [ordered]@{type='string';enum=@('CONTADOR')}
    crc = [ordered]@{type='string';minLength=1}
    function = [ordered]@{
      type='string'
      enum=@(
        'PERITO_DO_JUIZO','PERITO_ESCOLHIDO_PELAS_PARTES','PERITO_ARBITRAL',
        'PERITO_OFICIAL','PERITO_CONTABIL_CONTRATADO','ASSISTENTE_TECNICO'
      )
    }
    cnpc = [ordered]@{type=@('string','null')}
  }
}
$schema.'$defs'.PSObject.Properties.Remove('approval')
$schema.'$defs'.PSObject.Properties.Remove('signature')
$schema.'$defs'.PSObject.Properties.Remove('artifact')
$schema.'$defs'.PSObject.Properties.Remove('audit_event')
foreach ($definitionName in @('source','benchmark','calculation')) {
  $definition = $schema.'$defs'.$definitionName
  if ($definition -and $definition.required) {
    $definition.required = @($definition.required | Where-Object { $_ -notin @('sha256','response_sha256','input_sha256','output_sha256') })
  }
  if ($definition -and $definition.properties) {
    foreach ($propertyName in @('sha256','response_sha256','input_sha256','output_sha256')) {
      $definition.properties.PSObject.Properties.Remove($propertyName)
    }
  }
}
$schema.'$defs'.PSObject.Properties.Remove('sha256')

[System.IO.File]::WriteAllText(
  $schemaPath,
  ($schema | ConvertTo-Json -Depth 100),
  [System.Text.UTF8Encoding]::new($false)
)

$spec = Get-Content -LiteralPath $specPath -Raw -Encoding UTF8 | ConvertFrom-Json
$spec.specification = 'gerador-pericial-contabil-financeiro-multiprofissional'
$spec.specification_version = '3.0.0'
$spec.case_schema_file = '03_Schema_Caso_Pericial_Multiprofissional_V03.json'
foreach ($rule in $spec.document_type_rules.PSObject.Properties.Value) {
  if ($rule.required_evidence) {
    $rule.required_evidence = @($rule.required_evidence | Where-Object { $_ -ne 'CERTIDAO_REGULARIDADE' })
  }
}
$spec.states = [ordered]@{
  RASCUNHO = @('DADOS_EXTRAIDOS','CANCELADO')
  DADOS_EXTRAIDOS = @('DADOS_CONFIRMADOS','RASCUNHO','CANCELADO')
  DADOS_CONFIRMADOS = @('CALCULADO','DADOS_EXTRAIDOS','CANCELADO')
  CALCULADO = @('VALIDADO','DADOS_CONFIRMADOS','CANCELADO')
  VALIDADO = @('DOCUMENTO_GERADO','CALCULADO','CANCELADO')
  DOCUMENTO_GERADO = @('EM_REVISAO','LIBERADO_PARA_IMPRESSAO','VALIDADO','CANCELADO')
  EM_REVISAO = @('DOCUMENTO_GERADO','LIBERADO_PARA_IMPRESSAO','CANCELADO')
  LIBERADO_PARA_IMPRESSAO = @('EM_REVISAO','CANCELADO')
  CANCELADO = @()
}
$spec.roles = [ordered]@{
  ANALISTA = @('CRIAR_CASO','INGESTAR_DOCUMENTO','EXTRAIR_DADOS','GERAR_DOCUMENTO','LIBERAR_PARA_IMPRESSAO')
  REVISOR_DADOS = @('CONFIRMAR_DADOS','EXECUTAR_CONTROLES','SUBMETER_REVISAO')
  MOTOR_CALCULO = @('RECONCILIAR_PRINCIPAL','CALCULAR_PRICE','CALCULAR_SAC','CALCULAR_TAXA_IMPLICITA','CALCULAR_CET','CONSULTAR_BENCHMARK','CRIAR_CENARIO','PROCESSAR_HISTORICO_PAGAMENTOS')
  RESPONSAVEL_TECNICO = @('REGISTRAR_CORRECAO','APROVAR_JUSTIFICATIVA','LIBERAR_PARA_IMPRESSAO')
}
$removeCommands = @(
  'GERAR_MINUTA','APROVAR_TECNICAMENTE','ASSINAR_DOCUMENTO',
  'VALIDAR_ASSINATURA','PUBLICAR_PDF_FINAL'
)
foreach ($name in $removeCommands) { $spec.commands.PSObject.Properties.Remove($name) }
$spec.commands | Add-Member -NotePropertyName GERAR_DOCUMENTO -NotePropertyValue ([ordered]@{
  allowed_from=@('VALIDADO')
  result_state='DOCUMENTO_GERADO'
  allowed_roles=@('ANALISTA')
  required_payload=@('template_version','calculation_ids','scenario_ids','source_ids','technical_responsibles')
  rule='Gerar DOCX/PDF com um bloco de identificação e um bloco de assinatura/carimbo para cada profissional.'
}) -Force
$spec.commands | Add-Member -NotePropertyName LIBERAR_PARA_IMPRESSAO -NotePropertyValue ([ordered]@{
  allowed_from=@('DOCUMENTO_GERADO','EM_REVISAO')
  result_state='LIBERADO_PARA_IMPRESSAO'
  allowed_roles=@('ANALISTA','RESPONSAVEL_TECNICO')
  required_payload=@('document_version')
  rule='A liberação encerra o fluxo do gerador. Assinatura e carimbo são realizados no documento impresso.'
}) -Force
$spec.commands.SUBMETER_REVISAO.allowed_from = @('DOCUMENTO_GERADO')
$spec.commands.SUBMETER_REVISAO.result_state = 'EM_REVISAO'
$spec.commands.REGISTRAR_CORRECAO.allowed_from = @('DOCUMENTO_GERADO','EM_REVISAO','LIBERADO_PARA_IMPRESSAO')
$spec.commands.REGISTRAR_CORRECAO.result_state = 'EM_REVISAO'
$spec.commands.REGISTRAR_CORRECAO.required_payload = @('corrections','reason')
$spec.commands.REGISTRAR_CORRECAO.PSObject.Properties.Remove('rule')
if ($spec.commands.INGESTAR_DOCUMENTO.output) {
  $spec.commands.INGESTAR_DOCUMENTO.output = @($spec.commands.INGESTAR_DOCUMENTO.output | Where-Object { $_ -ne 'sha256' })
}

$controls = @($spec.controls | Select-Object -First 12)
$controls += [pscustomobject][ordered]@{
  id='CHK-013'
  name='IDENTIFICACAO_RESPONSAVEIS_TECNICOS'
  criterion='technical_responsibles possui ao menos um item com nome, categoria, CRC e função'
  blocking=$false
}
$controls += [pscustomobject][ordered]@{
  id='CHK-014'
  name='VERSAO_PARA_IMPRESSAO'
  criterion='zero tokens residuais e um bloco de assinatura/carimbo por profissional cadastrado'
  blocking=$false
}
$spec.controls = $controls
$spec.controls[10].criterion = 'not used OR official description, series code, unit, reference period, borrower, product, resource type, query time and source URL are present'
$spec.legacy_v01_corrections = @(
  'O cadastro profissional passou a aceitar um ou vários peritos.',
  'Nomes e registros profissionais deixaram de ser constantes do sistema.',
  'O fluxo termina em LIBERADO_PARA_IMPRESSAO.',
  'Assinatura e carimbo são realizados fisicamente após a impressão.',
  'Os controles V03 são CHK-001 a CHK-014.',
  'A ausência de documento não impede automaticamente a geração da revisão.',
  'A terminologia da conclusão contratual é preservada pelo gerador.'
)

[System.IO.File]::WriteAllText(
  $specPath,
  ($spec | ConvertTo-Json -Depth 100),
  [System.Text.UTF8Encoding]::new($false)
)

[pscustomobject]@{
  Schema = $schemaPath
  Spec = $specPath
  States = @($spec.states.PSObject.Properties).Count
  Commands = @($spec.commands.PSObject.Properties).Count
  Controls = $spec.controls.Count
}
