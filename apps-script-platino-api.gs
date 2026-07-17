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
    dataGrupoAberto: findColumn(["DATA/HORA DA ABERTURA DO GRUPO", "DATA DA ABERTURA DO GRUPO", "DATA GRUPO ABERTO"]),
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
      dataGrupoAberto: cell(row, column.dataGrupoAberto),
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
  const editedHeader = normalize(headers[e.range.getColumn() - 1]);
  const ensureTimestamp = headerName => {
    let timestampColumn = headers.findIndex(value => normalize(value) === normalize(headerName)) + 1;
    if (!timestampColumn) {
      timestampColumn = sheet.getLastColumn() + 1;
      sheet.getRange(1, timestampColumn).setValue(headerName);
      headers[timestampColumn - 1] = headerName;
    }
    const timestampCell = sheet.getRange(e.range.getRow(), timestampColumn);
    if (!timestampCell.getValue()) timestampCell.setValue(new Date()).setNumberFormat("dd/MM/yyyy HH:mm");
  };
  const hasValue = String(e.value || "").trim();
  const normalizedValue = normalize(hasValue);
  const isConfirmed = hasValue && !["NAO", "N", "FALSE", "0", "PENDENTE"].includes(normalizedValue);

  if (["CLIENTE", "NOME DO CLIENTE", "NOME"].includes(editedHeader) && hasValue) {
    ensureTimestamp("DATA/HORA DO CADASTRO");
  }
  if (["GRUPO ABERTO", "ABERTURA DO GRUPO", "GRUPO"].includes(editedHeader) && isConfirmed) {
    ensureTimestamp("DATA/HORA DA ABERTURA DO GRUPO");
  }
  if (["COMPROVANTE", "COMPROVANTE RECEBIDO", "STATUS COMPROVANTE"].includes(editedHeader) && isConfirmed) {
    ensureTimestamp("DATA DO COMPROVANTE");
  }
}
