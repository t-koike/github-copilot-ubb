/** Minimal RFC 4180 CSV parser with strict validation. */

export type CsvRecord = Record<string, string>;

export type CsvTable = {
  headers: string[];
  /** Data rows keyed by header. Blank lines are skipped. */
  records: CsvRecord[];
  /** 1-based line-oriented row number (header = 1) for each record, used in error messages. */
  rowNumbers: number[];
};

export function parseCsvTable(csv: string): CsvTable {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));

  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header === "")) {
    throw new Error("CSV contains an empty header.");
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    throw new Error(`CSV contains duplicate headers: ${[...new Set(duplicateHeaders)].join(", ")}`);
  }

  const records: CsvRecord[] = [];
  const rowNumbers: number[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;

    if (!row.some((value) => value.trim() !== "")) {
      return;
    }

    if (row.length > headers.length) {
      throw new Error(`Row ${rowNumber} has more columns than the header row.`);
    }

    const record: CsvRecord = {};
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] ?? "";
    });

    records.push(record);
    rowNumbers.push(rowNumber);
  });

  return { headers, records, rowNumbers };
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterClosingQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (afterClosingQuote) {
        throw new Error("CSV contains characters after a closing quote.");
      }

      if (inQuotes) {
        if (nextChar === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (field === "") {
        inQuotes = true;
      } else {
        throw new Error("CSV contains a quote inside an unquoted field.");
      }
      continue;
    }

    if (inQuotes) {
      field += char;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      afterClosingQuote = false;
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      afterClosingQuote = false;
      continue;
    }

    if (afterClosingQuote) {
      throw new Error("CSV contains characters after a closing quote.");
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  if (field !== "" || row.length > 0 || afterClosingQuote) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
