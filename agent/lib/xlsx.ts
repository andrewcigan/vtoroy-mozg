// Маленький сборщик .xlsx на node:zlib: один лист, строки текстом, шапка и фильтр. Без новых
// пакетов, чтобы обновления автора не спорили с package-lock.
import { crc32, deflateRawSync } from "node:zlib";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006";
const CELL_MAX = 32_767;
const WIDTHS = [18, 36, 60, 26, 13];

// XML 1.0 не допускает управляющие символы и половинки суррогатных пар.
const clean = (value: string): string =>
  [...value]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return (
        (code >= 0x20 || code === 0x09 || code === 0x0a) &&
        !(code >= 0xd800 && code <= 0xdfff) &&
        code !== 0xfffe &&
        code !== 0xffff
      );
    })
    .join("")
    .slice(0, CELL_MAX)
    .replace(/[\uD800-\uDBFF]$/u, "");

const esc = (value: string): string =>
  clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function column(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// inlineStr — всегда текст: «=…» и «+7» Excel не считает формулой.
function row(cells: readonly string[], at: number, style: number): string {
  const xml = cells.map(
    (cell, i) =>
      `<c r="${column(i)}${at}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`,
  );
  return `<row r="${at}">${xml.join("")}</row>`;
}

function sheet(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const last = `${column(headers.length - 1)}${rows.length + 1}`;
  const cols = headers.map(
    (_, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${WIDTHS[i] ?? 20}" customWidth="1"/>`,
  );
  return `${XML}<worksheet xmlns="${MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols.join("")}</cols><sheetData>${row(headers, 1, 1)}${rows.map((cells, i) => row(cells, i + 2, 2)).join("")}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}

function zip(files: readonly (readonly [string, string])[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const raw = Buffer.from(content);
    const packed = deflateRawSync(raw);
    const path = Buffer.from(name);
    const meta = Buffer.alloc(26);
    meta.writeUInt16LE(20, 0);
    meta.writeUInt16LE(0x0800, 2);
    meta.writeUInt16LE(8, 4);
    meta.writeUInt16LE(0x21, 8);
    meta.writeUInt32LE(crc32(raw), 10);
    meta.writeUInt32LE(packed.byteLength, 14);
    meta.writeUInt32LE(raw.byteLength, 18);
    meta.writeUInt16LE(path.byteLength, 22);
    parts.push(Buffer.from([0x50, 0x4b, 3, 4]), meta, path, packed);
    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(offset, 10);
    central.push(Buffer.from([0x50, 0x4b, 1, 2, 20, 0]), meta, tail, path);
    offset += 4 + meta.byteLength + path.byteLength + packed.byteLength;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(18);
  end.writeUInt16LE(files.length, 4);
  end.writeUInt16LE(files.length, 6);
  end.writeUInt32LE(directory.byteLength, 8);
  end.writeUInt32LE(offset, 12);
  return Buffer.concat([
    ...parts,
    directory,
    Buffer.from([0x50, 0x4b, 5, 6]),
    end,
  ]);
}

export function buildXlsx(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): Buffer {
  const type = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  return zip([
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${type}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${type}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${type}.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="${PKG}/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Мой мозг" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="${PKG}/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    ],
    ["xl/worksheets/sheet1.xml", sheet(headers, rows)],
  ]);
}
