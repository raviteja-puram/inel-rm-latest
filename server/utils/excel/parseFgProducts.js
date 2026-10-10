import { readWorkbookBuffer, sheetToRows, mapHeaders, cell } from './readWorkbook.js';

export function parseFgProductsFlat(buffer) {
  const wb = readWorkbookBuffer(buffer);
  const { rows } = sheetToRows(wb);
  if (!rows.length) return { fgMap: new Map(), errors: [] };
  const headerMap = mapHeaders(rows[0] || []);
  const headerKeys = Object.keys(headerMap);
  const hasHeader = headerKeys.some((key) =>
    /fg|component|material|description|norms?|uom|productionquantity|productiondate|quantity|^qty$|partno|partnum|partnumber|^date$/.test(key),
  );
  if (hasHeader) {
    const has = (...aliases) => aliases.some((alias) => headerMap[alias.replace(/[^a-z0-9]+/gi, '').toLowerCase()] !== undefined);
    const requiredHeaders = [
      ['FG Part Number', has('fg part number', 'fg part no', 'fg part num', 'fgpartnumber', 'fgpartno', 'part no', 'part number')],
      ['FG Description', has('fg description', 'description', 'desc')],
      ['Material ID', has('material id', 'component id', 'material', 'component')],
      ['Material Description', has('material description', 'material descriptionn', 'component description')],
      ['Norms', has('norms', 'norm')],
      ['UOM', has('uom', 'unit of measure')],
    ];
    const missing = requiredHeaders.filter(([, present]) => !present).map(([label]) => label);
    if (missing.length) {
      return {
        fgMap: new Map(), errors: [],
        fatalError: `This file does not match the FG BOM upload format. Missing required columns: ${missing.join(', ')}. Production plans cannot be uploaded as FG data.`,
      };
    }
  }
  const start = hasHeader ? 1 : 0;
  const map = hasHeader ? mapHeaders(rows[0]) : {};
  const fgMap = new Map(), errors = [];
  let skippedDuplicates = 0;
  let skippedPlaceholders = 0;
  let currentPartNo = "";
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v === null || v === '')) continue;
    const rowPartNo = String(cell(
      row,
      map,
      'fgpartnumber',
      'fg part number',
      'fgpartnum',
      'fg part num',
      'fgpartno',
      'fg part no',
      'fgid',
      'fg id',
      'partno',
      'part no',
      'productid',
      'product id',
    ) ?? row[0] ?? '').trim();
    const desc = String(
      cell(row, map, 'description', 'desc', 'fgdescription', 'fg description') ?? row[1] ?? row[2] ?? '',
    ).trim();
    const name = String(cell(row, map, 'name', 'fgname', 'fg name') || desc || row[2] || row[1] || '').trim();
    if (rowPartNo) {
      if (/^(empty|tbd|tb\d)/i.test(rowPartNo)) {
        currentPartNo = "";
        skippedPlaceholders += 1;
        continue;
      }
      currentPartNo = rowPartNo;
      if (!fgMap.has(currentPartNo)) {
        const fgCategory = String(
          cell(row, map, 'fgcategory', 'fg category', 'category', 'productcategory', 'product category') ?? '',
        ).trim();
        if (!desc) {
          errors.push(`Row ${i+1}: missing Description`);
          currentPartNo = "";
          continue;
        }
        fgMap.set(currentPartNo, {
          partNo: currentPartNo, name,
          desc,
          buyer: String(cell(row, map, 'buyer', 'buyercontroller', 'buyer controller') ?? row[5] ?? '').trim(),
          customer: String(cell(row, map, 'customername', 'customer name', 'customer') ?? '').trim(),
          customerCategory: String(cell(row, map, 'customercategory', 'customer category', 'catageory') ?? '').trim(),
          marketSegment: String(cell(row, map, 'marketsegment', 'market segment', 'segment') ?? '').trim(),
          productGroup: String(cell(row, map, 'productgroup', 'product group') ?? '').trim(),
          fgCategory,
          items: [], monthlyPlan: {},
        });
      }
    }
    const partNo = currentPartNo;
    const componentId = String(
      cell(
        row,
        map,
        'componentid',
        'component id',
        'materialid',
        'material id',
        'components',
        'component',
        'componentpartnumber',
        'component part number',
        'rawmaterial',
        'raw material',
      ) ?? (hasHeader ? '' : row[3] ?? row[6] ?? row[5]) ?? '',
    ).trim();
    const materialDescription = String(
      cell(row, map, 'material description', 'material descriptionn', 'component description', 'materialdescription') ?? '',
    ).trim();
    const uom = String(cell(row, map, 'uom', 'unit of measure') ?? '').trim();
    const norms = Number(
      cell(row, map, 'norms', 'norm', 'normsperunit', 'norm per unit') ?? row[4] ?? row[7] ?? row[6],
    ) || 0;
    if (!partNo) {
      errors.push(`Row ${i + 1}: FG Part Number is required`);
      continue;
    }
    if (!componentId || !materialDescription || !uom || norms <= 0) {
      const missing = [
        !componentId && 'Material ID',
        !materialDescription && 'Material Description',
        !Number.isFinite(norms) || norms <= 0 ? 'Norms' : '',
        !uom && 'UOM',
      ].filter(Boolean);
      errors.push(`Row ${i+1}: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`);
      continue;
    }
    const fg = fgMap.get(partNo);
    const existing = fg.items.find(
      (x) => x.componentId.toUpperCase() === componentId.toUpperCase(),
    );
    if (existing) {
      skippedDuplicates += 1;
    } else {
      fg.items.push({ componentId, norms });
    }
  }
  return { fgMap, errors, skippedDuplicates, skippedPlaceholders };
}
