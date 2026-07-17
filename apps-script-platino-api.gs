/**
 * Cole esta função no mesmo projeto do Google Apps Script que já cria as pastas.
 * Ela localiza as colunas pelo nome, portanto a ordem das colunas pode mudar.
 */
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("# COMERCIAL");
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "Aba # COMERCIAL não encontrada." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return ContentService
      .createTextOutput("[]")
      .setMimeType(ContentService.MimeType.JSON);
  }

  const normalizeHeader = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const headers = values[0].map(normalizeHeader);
  const findColumn = aliases => {
    for (const alias of aliases) {
      const index = headers.indexOf(normalizeHeader(alias));
      if (index >= 0) return index;
    }
    return -1;
  };
  const column = {
    cliente: findColumn(["CLIENTE", "NOME DO CLIENTE", "NOME"]),
    dataVenda: findColumn(["DATA DA VENDA", "DATA VENDA", "DATA"]),
    dataCadastro: findColumn(["DATA/HORA DO CADASTRO", "DATA HORA DO CADASTRO", "CRIADO EM"]),
    vendedor: findColumn(["VENDEDOR", "CONSULTOR", "RESPONSAVEL", "RESPONSÁVEL"]),
    valor: findColumn(["VALOR DO PROCEDIMENTO", "VALOR DA VENDA", "VALOR VENDA", "VALOR", "VALOR LIQUIDO", "VALOR LÍQUIDO"]),
    grupoAberto: findColumn(["GRUPO ABERTO", "ABERTURA DO GRUPO", "GRUPO"]),
    status: findColumn(["OBSERVAÇÃO", "OBSERVACAO", "STATUS", "SITUACAO", "SITUAÇÃO"]),
    distrato: findColumn(["DISTRATO", "STATUS DISTRATO", "CANCELAMENTO"]),
    comprovante: findColumn(["COMPROVANTE", "COMPROVANTE RECEBIDO", "STATUS COMPROVANTE"]),
    dataComprovante: findColumn(["DATA DO COMPROVANTE", "DATA COMPROVANTE", "HORA DO COMPROVANTE"])
  };
  const cell = (row, index) => index >= 0 ? String(row[index] || "").trim() : "";

  const result = values.slice(1)
    .map(row => ({
      cliente: cell(row, column.cliente),
      dataVenda: cell(row, column.dataVenda),
      dataCadastro: cell(row, column.dataCadastro),
      vendedor: cell(row, column.vendedor),
      valor: cell(row, column.valor),
      grupoAberto: cell(row, column.grupoAberto),
      status: cell(row, column.status),
      distrato: cell(row, column.distrato),
      comprovante: cell(row, column.comprovante),
      dataComprovante: cell(row, column.dataComprovante)
    }))
    .filter(item => item.cliente);

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Registra automaticamente o momento em que um novo cliente é preenchido.
 * O prazo de três horas para abertura do grupo usa este horário.
 */
function onEdit(e) {
  const sheet = e && e.range && e.range.getSheet();
  if (!sheet || sheet.getName() !== "# COMERCIAL" || e.range.getRow() < 2) return;

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const normalize = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const clientColumn = headers.findIndex(value => ["CLIENTE", "NOME DO CLIENTE", "NOME"].includes(normalize(value))) + 1;
  if (!clientColumn || e.range.getColumn() !== clientColumn || !String(e.value || "").trim()) return;

  let createdAtColumn = headers.findIndex(value => normalize(value) === "DATA/HORA DO CADASTRO") + 1;
  if (!createdAtColumn) {
    createdAtColumn = lastColumn + 1;
    sheet.getRange(1, createdAtColumn).setValue("DATA/HORA DO CADASTRO");
  }
  const createdAtCell = sheet.getRange(e.range.getRow(), createdAtColumn);
  if (!createdAtCell.getValue()) {
    createdAtCell.setValue(new Date()).setNumberFormat("dd/MM/yyyy HH:mm");
  }
}
