import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEMPLATE_DIR = path.join(process.cwd(), "modelos-originais");

const TEMPLATE_FILES = {
  chargeback: "chargeback.docx",
  "citacao-intimacao-extrajudicial": "citacao-intimacao-extrajudicial.docx",
  "citacao-judicial": "citacao-judicial.docx",
  "contestacao-taxas-email": "contestacao-taxas-email.docx",
  "declaracao-ausencia-carteira-trabalho": "declaracao-ausencia-carteira-trabalho.docx",
  "declaracao-hipossuficiencia": "declaracao-hipossuficiencia.docx",
  "declaracao-isencao-irpf": "declaracao-isencao-irpf.docx",
  "notificacao-extrajudicial-platino": "notificacao-extrajudicial-platino.docx",
  "procuracao-dra-juliane": "procuracao-dra-juliane.docx",
  "termo-ciencia-autorizacao-seguranca": "termo-ciencia-autorizacao-seguranca.docx",
  "termo-compromisso-pagamento": "termo-compromisso-pagamento.docx",
  "modelo-termo-compromisso-pagamento": "modelo-termo-compromisso-pagamento.docx"
};

const TEMPLATE_TITLES = {
  chargeback: "Contestação de Chargeback",
  "citacao-intimacao-extrajudicial": "Citação Intimação Extrajudicial",
  "citacao-judicial": "Citação Judicial",
  "contestacao-taxas-email": "Contestação de Taxas por E-mail",
  "declaracao-ausencia-carteira-trabalho": "Declaração de Ausência de Carteira de Trabalho",
  "declaracao-hipossuficiencia": "Declaração de Hipossuficiência",
  "declaracao-isencao-irpf": "Declaração de Isenção de IRPF",
  "notificacao-extrajudicial-platino": "Notificação Extrajudicial Platino",
  "procuracao-dra-juliane": "Procuração Ad Judicia",
  "termo-ciencia-autorizacao-seguranca": "Termo de Ciência e Autorização de Segurança",
  "termo-compromisso-pagamento": "Termo de Compromisso de Pagamento",
  "modelo-termo-compromisso-pagamento": "Modelo - Termo de Compromisso de Pagamento"
};

function value(data, key) {
  return String(data?.[key] || "").trim();
}

function replacementsFor(templateKey, data) {
  const commonDate = [
    ["dia", value(data, "dia")],
    ["mês", value(data, "mes")],
    ["mes", value(data, "mes")],
    ["XX", value(data, "dia")],
    ["XXXXXXX", value(data, "mes")],
    ["XXXXXXXXXX", value(data, "mesMaiusculo")]
  ];

  const maps = {
    chargeback: [
      ["NOME DO CLIENTE", value(data, "cliente")],
      ["CPF DO CLIENTE", value(data, "cpf")],
      ["DATA", value(data, "dataPagamento")],
      ["VALOR", value(data, "valor")],
      ["Nome do responsável pelo documento", value(data, "responsavel")],
      ["Estado", value(data, "estado")],
      ...commonDate
    ],
    "citacao-intimacao-extrajudicial": [
      ["Nome do banco", value(data, "banco")],
      ["xx.xxx.xxx/xxxx-xx", value(data, "cnpjBanco")],
      ["Endereço completo do banco", value(data, "enderecoBanco")],
      ["data de contrato com o banco", value(data, "dataContrato")],
      ["______", value(data, "parcelaCorrigida")],
      ["$______", value(data, "reducaoParcela")],
      ["______", value(data, "estorno")],
      ["______", value(data, "reducaoTotal")],
      ...commonDate,
      ["NOME DO CLIENTE", value(data, "cliente")]
    ],
    "citacao-judicial": [
      ["Numero de processo", value(data, "numeroProcesso")],
      ["NOME DO CLIENTE", value(data, "cliente")],
      ["NOME DA INSTITUIÇÃO FINANCEIRA/BANCO", value(data, "banco")],
      ...commonDate,
      ["NOME DO CLIENTE", value(data, "cliente")]
    ],
    "contestacao-taxas-email": [
      ["___________", value(data, "banco")],
      ["Nome do cliente", value(data, "cliente")],
      ["XXX.XXX.XXX-XX", value(data, "cpf")],
      ["X.XXX,XX", value(data, "seguro")],
      ["X.XXX,X", value(data, "registroContrato")],
      [
        "Tarifa de avaliação: R$X.XXX,X",
        `Tarifa de avaliação: R$${value(data, "tarifaAvaliacao")}\rTarifa de cadastro: R$${value(data, "tarifaCadastro")}\rDemais Tarifas: R$${value(data, "demaisTarifas")}`
      ],
      ["X.XXX,X", value(data, "iof")],
      ["X.XXX,X", value(data, "iofAdicional")]
    ],
    "declaracao-ausencia-carteira-trabalho": [
      ["NOME COMPLETO DO CLIENTE", value(data, "cliente")],
      ["nacionalidade", value(data, "nacionalidade")],
      ["estado civil", value(data, "estadoCivil")],
      ["profissão", value(data, "profissao")],
      ["número do RG", value(data, "rg")],
      ["número do CPF", value(data, "cpf")],
      ["e-mail", value(data, "email")],
      ["endereço completo, número, bairro, cidade/UF, CEP", value(data, "endereco")],
      ["Estado", value(data, "estado")],
      ...commonDate,
      ["NOME COMPLETO DO CLIENTE", value(data, "cliente")]
    ],
    "declaracao-hipossuficiencia": [
      ["XXXXXXXXXXXXXX", value(data, "cliente")],
      ["NACIONALIDADE", value(data, "nacionalidade")],
      ["ESTADO CIVIL", value(data, "estadoCivil")],
      ["PROFISSÃO", value(data, "profissao")],
      ["XXXXXXXXX", value(data, "rg")],
      ["XXXXXXXXXXX", value(data, "cpf")],
      ["XXXXXXXXXXXXXXXXXXXXXXX", value(data, "email")],
      ["XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", value(data, "endereco")],
      ["ESTADO, XX de XXXXXXXX de XXXX", `${value(data, "estado")}, ${value(data, "dia")} de ${value(data, "mes")} de ${value(data, "ano")}`],
      ["NOME DO CLIENTE", value(data, "cliente")]
    ],
    "declaracao-isencao-irpf": [
      ["XXXXXXXXXXXXXXXXXXXXXX", value(data, "cliente")],
      ["NACIONALIDADE", value(data, "nacionalidade")],
      ["ESTADO CIVIL", value(data, "estadoCivil")],
      ["PROFISSÃO", value(data, "profissao")],
      ["XXXXXXXXXXXX", value(data, "rg")],
      ["XXXXXXXXXXXX", value(data, "cpf")],
      ["XXXXXXXXXXXXXXXXXXXXXXXXXXX", value(data, "email")],
      ["XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", value(data, "endereco")],
      ["ESTADO-UF", value(data, "estado")],
      ["XX", value(data, "dia")],
      ["XXXXXXXXXX", value(data, "mesMaiusculo")],
      ["XXXXXXXXXX NOME XXXXXXXXXXX", value(data, "cliente")]
    ],
    "notificacao-extrajudicial-platino": [
      ...commonDate,
      ["NOME DO BANCO", value(data, "banco")],
      ["XX.XXX.XXX/XXXX-XX", value(data, "cnpjBanco")],
      ["Endereço completo do banco.", value(data, "enderecoBanco")],
      ["NOME DO CLIENTE", value(data, "cliente")],
      ["CPF DO CLIENTE", value(data, "cpf")],
      ["NOME DO BANCO", value(data, "banco")],
      ["XX.XXX.XXX/XXXX-XX", value(data, "cnpjBanco")],
      ["NOME DO CLIENTE", value(data, "cliente")],
      ["CPF DO CLIENTE", value(data, "cpf")],
      ["valor", value(data, "valor")],
      ["valor por extenso", value(data, "valorExtenso")],
      ["quantidade", value(data, "quantidadeParcelas")],
      ["valor", value(data, "valorParcela")],
      ["da parcela", ""],
      ["valor por extenso", value(data, "valorParcelaExtenso")],
      ["data de início da representação", value(data, "dataRepresentacao")]
    ],
    "procuracao-dra-juliane": [
      ["XXXXXXXXXXXXXXXXXX", value(data, "cliente")],
      ["nacionalidade", value(data, "nacionalidade")],
      ["estado cívil", value(data, "estadoCivil")],
      ["profissão", value(data, "profissao")],
      ["XXXXXXXXX", value(data, "rg")],
      ["XXXXXXXXXX", value(data, "cpf")],
      ["XXXXXXXXXXXXXXXXXX", value(data, "email")],
      ["XXXXXXXXXXXXXXXXXXXXXXXXX", value(data, "endereco")],
      ["XXXXX-XXX", value(data, "cep")],
      ["BANCO XXXXXXXX", value(data, "banco")],
      ["XXXXXXXXX", value(data, "contrato")],
      ["Estado", value(data, "estado")],
      ["XX", value(data, "dia")],
      ["XXXXXXX", value(data, "mes")],
      ["XXXXXXXXXXXX", value(data, "cliente")]
    ],
    "termo-ciencia-autorizacao-seguranca": [
      ...commonDate,
      ["Nome do cliente", value(data, "cliente")],
      ["xxx.xxx.xxx-xx", value(data, "cpf")],
      ["dia/mês/2026", value(data, "dataReclamacao")],
      ["Nome do Banco", value(data, "banco")],
      ["________________________", value(data, "protocolo")],
      ["NOME DO CLIENTE", value(data, "cliente")]
    ],
    "termo-compromisso-pagamento": [
      ["NOME DO CLIENTE", value(data, "cliente")],
      ["XXX.XXX.XXX-XX", value(data, "cpf")],
      ["Valor", value(data, "valor")],
      ["Valor por extenso", value(data, "valorExtenso")],
      ["SERVIÇO", value(data, "servico")],
      ["Estado", value(data, "estado")],
      ...commonDate,
      ["NOME COMPLETO DO CLIENTE", value(data, "cliente")]
    ],
    "modelo-termo-compromisso-pagamento": [
      ["NOME COMPLETO DO CLIENTE", value(data, "cliente")],
      ["XXX.XXX.XXX-XX", value(data, "cpf")],
      ["PRODUTO", value(data, "produto")],
      ["X.XXX,XX", value(data, "valor")],
      ["VALOR POR ESCRITO", value(data, "valorExtenso")],
      ["XX/XX/XXXX", value(data, "dataPagamento")],
      ["NOME COMPLETO DO CLIENTE", value(data, "cliente")],
      ["XXX.XXX.XXX-XX", value(data, "cpf")]
    ]
  };

  return (maps[templateKey] || []).filter(([, replacement]) => replacement !== "");
}

function slugify(value) {
  return String(value || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "documento";
}

function runPowerShell(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `PowerShell exited with code ${code}`));
    });
  });
}

async function checkWordAvailability() {
  const healthScript = path.join(os.tmpdir(), `platino-word-health-${crypto.randomUUID()}.ps1`);
  await fs.writeFile(healthScript, `
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Output "ok"
`, "utf8");

  try {
    await runPowerShell(healthScript, []);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      detail: error.message
    };
  } finally {
    await fs.rm(healthScript, { force: true }).catch(() => {});
  }
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    const word = await checkWordAvailability();
    response.setHeader("Cache-Control", "no-store");
    return response.status(word.ok ? 200 : 503).json({
      ok: word.ok,
      engine: "Microsoft Word",
      message: word.ok
        ? "Gerador de documentos pronto."
        : "Microsoft Word não está disponível para geração fiel dos PDFs.",
      detail: word.detail || null
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const { templateKey, data = {} } = request.body || {};
  const templateFile = TEMPLATE_FILES[templateKey];
  if (!templateFile) {
    return response.status(400).json({ error: "Modelo inválido." });
  }

  const templatePath = path.join(TEMPLATE_DIR, templateFile);
  const jobId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `platino-doc-${jobId}`);
  const replacementsPath = path.join(workDir, "replacements.json");
  const scriptPath = path.join(workDir, "generate.ps1");
  const outputPath = path.join(workDir, "documento.pdf");

  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.access(templatePath);
    await fs.writeFile(replacementsPath, JSON.stringify(replacementsFor(templateKey, data), null, 2), "utf8");
    await fs.writeFile(scriptPath, `
param(
  [string]$TemplatePath,
  [string]$OutputPath,
  [string]$ReplacementsPath
)
$ErrorActionPreference = "Stop"
$items = Get-Content -LiteralPath $ReplacementsPath -Raw | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $document = $word.Documents.Open($TemplatePath, $false, $true)
  foreach ($item in $items) {
    $findText = [string]$item[0]
    $replaceText = [string]$item[1]
    if ([string]::IsNullOrWhiteSpace($findText)) { continue }

    $range = $document.Content
    $find = $range.Find
    $find.ClearFormatting()
    $find.Replacement.ClearFormatting()
    $find.Text = $findText
    $find.Forward = $true
    $find.Wrap = 0
    $find.Format = $true
    $find.Highlight = $true
    $find.MatchCase = $false
    $find.MatchWholeWord = $false
    $find.MatchWildcards = $false

    if (-not $find.Execute()) {
      $range = $document.Content
      $find = $range.Find
      $find.ClearFormatting()
      $find.Replacement.ClearFormatting()
      $find.Text = $findText
      $find.Forward = $true
      $find.Wrap = 0
      $find.Format = $false
      $find.MatchCase = $false
      $find.MatchWholeWord = $false
      $find.MatchWildcards = $false
      if (-not $find.Execute()) { continue }
    }

    # Substitui somente o texto destacado encontrado. A linha de assinatura,
    # alinhamento, margens e espaçamentos permanecem os do modelo Word.
    $range.Text = $replaceText
    $range.HighlightColorIndex = 0
  }
  $document.ExportAsFixedFormat($OutputPath, 17)
  $document.Close($false)
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
`, "utf8");

    await runPowerShell(scriptPath, [templatePath, outputPath, replacementsPath]);
    const pdf = await fs.readFile(outputPath);
    const filenameParts = [
      TEMPLATE_TITLES[templateKey],
      data.cliente || data.banco || "documento",
      data.numeroDocumento || jobId.slice(0, 8)
    ];
    const filename = `${filenameParts.map(slugify).join("-")}.pdf`;

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(pdf);
  } catch (error) {
    return response.status(500).json({
      error: "Não foi possível gerar o PDF preservando o modelo Word.",
      detail: error.message
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
