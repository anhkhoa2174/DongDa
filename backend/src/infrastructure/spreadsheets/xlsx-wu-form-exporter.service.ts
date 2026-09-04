import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join, posix } from 'path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { CreateWuDto } from '../../application/dtos/wu/wu.dto';
import type { IWuFormExporter, WuFormBank, WuFormExport } from '../../application/ports/wu-form-exporter.port';
import {
  isVietnamCountry, normalizeCountryName, normalizeUpperText, normalizeUsStateName,
} from '../../domain/services/wu-reference-data';

const TEMPLATE_PATH = join(process.cwd(), 'src', 'assets', 'wu-form-template.xlsx');
const ACB_TEMPLATE_PATH = join(process.cwd(), 'src', 'assets', 'wu-acb-form-template.xlsx');
const WORKBOOK_XML = 'xl/workbook.xml';
const WORKBOOK_RELS_XML = 'xl/_rels/workbook.xml.rels';
const CONTENT_TYPES_XML = '[Content_Types].xml';
const CALC_CHAIN_XML = 'xl/calcChain.xml';
type ZipEntries = Record<string, Uint8Array>;
type CellValue = string | number | undefined;

@Injectable()
export class XlsxWuFormExporterService implements IWuFormExporter {
  async export(bank: WuFormBank, dto: CreateWuDto): Promise<WuFormExport> {
    try {
      const entries = unzipSync(await readFile(bank === 'ACB' ? ACB_TEMPLATE_PATH : TEMPLATE_PATH));
      const workbookXml = readXml(entries, WORKBOOK_XML);
      const paths = resolveSheetPaths(workbookXml, readXml(entries, WORKBOOK_RELS_XML));
      const isVietnamese = isVietnamCountry(dto.identityIssuingCountry);
      const targetName = bank === 'ACB'
        ? 'PHIẾU ACB (VN)'
        : (isVietnamese ? 'PHIẾU MSB (vn)' : 'PHIẾU MSB (nước ngoài)');

      if (bank === 'ACB') prepareAcbTemplate(entries, paths, targetName);
      patchSheet(entries, paths, targetName, outputCells(dto, bank, isVietnamese));
      keepOnlySheet(entries, workbookXml, paths, targetName, bank);
      removeStaleCalculationChain(entries);
      removeExternalLinks(entries);
      return { buffer: Buffer.from(zipSync(entries, { level: 6 })), filename: `WU-${bank}-${dto.mtcn}.xlsx` };
    } catch (error) {
      throw new InternalServerErrorException(
        `Không thể tạo phiếu WU: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }
}

function patchSheet(entries: ZipEntries, paths: Map<string, string>, name: string, values: Record<string, CellValue>) {
  const path = paths.get(name);
  if (!path || !entries[path]) throw new Error(`Không tìm thấy sheet mẫu ${name}`);
  let xml = readXml(entries, path);
  for (const [address, value] of Object.entries(values)) xml = replaceCellValue(xml, address, value);
  entries[path] = strToU8(xml);
}

function outputCells(dto: CreateWuDto, bank: WuFormBank, isVietnamese: boolean): Record<string, CellValue> {
  const mtcn = formatMtcn(dto.mtcn);
  const paidAmount = dto.paidCurrency === 'VND' ? dto.wuVndAmount : dto.wuUsdAmount;
  const dob = formatDate(dto.receiverDateOfBirth);
  const issueDate = formatDate(dto.identityIssueDate);
  const expiryDate = formatDate(dto.identityExpiryDate);
  const sendingCountry = normalizeCountryName(dto.sendingCountry);
  const senderState = normalizeUsStateName(dto.senderState);
  const placeOfIssue = normalizeUpperText(dto.identityPlaceOfIssue || dto.identityIssuingCountry);
  const issuingCountry = normalizeCountryName(dto.identityIssuingCountry);
  const countryOfBirth = normalizeCountryName(dto.countryOfBirth);
  const nationality = normalizeCountryName(dto.nationality?.trim() || dto.countryOfBirth);
  if (bank === 'ACB') {
    const cells: Record<string, CellValue> = {
      D6: mtcn,
      D7: sendingCountry,
      D8: senderState,
      D10: paidAmount,
      G10: dto.paidCurrency,
      D12: dto.customerName,
      D13: dob,
      K13: dto.customerPhone,
      D14: dto.currentAddress,
      D15: dto.identityAddress,
      G17: dto.identityDocumentType,
      K17: dto.identityDocumentNumber,
      C18: issuingCountry,
      G18: placeOfIssue,
      J18: issueDate,
      M18: expiryDate,
      C20: dto.hasVisa ? visaTypeLabel(dto.visaType) : '',
      G20: dto.hasVisa ? dto.visaNumber : '',
      J20: dto.hasVisa ? formatDate(dto.visaIssueDate) : '',
      M20: dto.hasVisa ? formatDate(dto.visaExpiryDate) : '',
      D21: dto.employmentStatus,
      D22: countryOfBirth,
      J22: nationality,
      D23: dto.senderRelationship,
      J23: dto.receivePurpose,
      D25: dto.senderName,
      C35: mtcn,
      H35: dto.identityDocumentNumber,
      C37: paidAmount,
      D37: dto.paidCurrency,
      H37: dto.identityDocumentType,
      H39: placeOfIssue,
      C41: paidAmount,
      G41: issueDate,
      I41: expiryDate,
      C43: dto.appliedRate,
    };
    return cells;
  }
  return {
    D10: mtcn, D12: dto.senderName, D14: sendingCountry, G16: senderState,
    D18: paidAmount, I18: dto.paidCurrency, D21: dto.customerName, C23: dob,
    G23: dto.customerPhone, D25: dto.currentAddress, F27: dto.identityAddress,
    C29: dto.identityDocumentType, G29: dto.identityDocumentNumber,
    C31: issueDate, G31: expiryDate, C33: placeOfIssue,
    G33: issuingCountry, C35: nationality, G35: countryOfBirth,
  };
}

function prepareAcbTemplate(entries: ZipEntries, paths: Map<string, string>, name: string) {
  const path = paths.get(name);
  if (!path || !entries[path]) throw new Error(`Không tìm thấy sheet mẫu ${name}`);
  const xml = readXml(entries, path)
    .replace('<mergeCells count="78">', '<mergeCells count="79">')
    .replace('<mergeCell ref="A8:N9"/>', '<mergeCell ref="A8:C9"/><mergeCell ref="D8:N9"/>');
  entries[path] = strToU8(xml);
}

function resolveSheetPaths(workbookXml: string, relationshipsXml: string) {
  const targets = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = xmlAttribute(match[1], 'Id');
    const target = xmlAttribute(match[1], 'Target');
    if (id && target) targets.set(id, posix.normalize(posix.join('xl', target)));
  }
  const paths = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const name = xmlAttribute(match[1], 'name');
    const id = xmlAttribute(match[1], 'r:id');
    const target = id ? targets.get(id) : undefined;
    if (name && target) paths.set(decodeXml(name), target);
  }
  return paths;
}

function replaceCellValue(xml: string, address: string, value: CellValue) {
  const openTagPattern = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)>`);
  const match = openTagPattern.exec(xml);
  if (!match) throw new Error(`Không tìm thấy ô ${address} trong file mẫu`);
  const attrs = match[1].replace(/\s+t="[^"]*"/g, '').replace(/\/\s*$/, '');
  const replacement = typeof value === 'number'
    ? `<c${attrs}><v>${value}</v></c>`
    : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value ?? ''))}</t></is></c>`;
  const cellStart = match.index;
  const cellEnd = match[0].endsWith('/>')
    ? cellStart + match[0].length
    : xml.indexOf('</c>', cellStart + match[0].length) + 4;
  if (cellEnd < 4) throw new Error(`Ô ${address} trong file mẫu không hợp lệ`);
  return `${xml.slice(0, cellStart)}${replacement}${xml.slice(cellEnd)}`;
}

function keepOnlySheet(
  entries: ZipEntries,
  workbookXml: string,
  paths: Map<string, string>,
  selectedName: string,
  bank: WuFormBank,
) {
  const selectedPath = paths.get(selectedName);
  if (!selectedPath) throw new Error(`Không tìm thấy sheet mẫu ${selectedName}`);

  for (const [name, path] of paths) {
    if (name === selectedName) continue;
    delete entries[path];
    delete entries[posix.join(posix.dirname(path), '_rels', `${posix.basename(path)}.rels`)];
  }

  const selectedTag = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)]
    .find((match) => decodeXml(xmlAttribute(match[1], 'name') ?? '') === selectedName);
  if (!selectedTag) throw new Error(`Không tìm thấy khai báo sheet ${selectedName}`);
  const selectedAttrs = selectedTag[1].replace(/\s+state="[^"]*"/g, '').replace(/\/\s*$/, '');
  let xml = workbookXml.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets><sheet${selectedAttrs}/></sheets>`);
  xml = xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, '');
  if (bank === 'ACB') {
    const escapedSheetName = selectedName.replace(/'/g, "''");
    const printArea = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${escapedSheetName}'!$A$1:$N$50</definedName></definedNames>`;
    xml = xml.replace(/<calcPr\b/, `${printArea}<calcPr`);
  }
  xml = xml
    .replace(/(<workbookView\b[^>]*?)\sactiveTab="\d+"/, '$1 activeTab="0"')
    .replace(/(<workbookView\b[^>]*?)\sfirstSheet="\d+"/, '$1 firstSheet="0"')
    .replace(/<calcPr\b([^>]*)\/?\s*>/, (_tag, attrs: string) => {
      const cleaned = attrs
        .replace(/\s+(?:calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '')
        .replace(/\/\s*$/, '');
      return `<calcPr${cleaned} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
    });

  let relationships = readXml(entries, WORKBOOK_RELS_XML);
  relationships = relationships.replace(/<Relationship\b([^>]*)\/?\s*>/g, (tag, attrs: string) => {
    if (!xmlAttribute(attrs, 'Type')?.endsWith('/worksheet')) return tag;
    const target = xmlAttribute(attrs, 'Target');
    const path = target ? posix.normalize(posix.join('xl', target)) : '';
    return path === selectedPath ? tag : '';
  });
  let contentTypes = readXml(entries, CONTENT_TYPES_XML);
  contentTypes = contentTypes.replace(/<Override\b([^>]*)\/?\s*>/g, (tag, attrs: string) => {
    const partName = xmlAttribute(attrs, 'PartName');
    if (!partName?.startsWith('/xl/worksheets/')) return tag;
    return partName === `/${selectedPath}` ? tag : '';
  });

  entries[WORKBOOK_XML] = strToU8(xml);
  entries[WORKBOOK_RELS_XML] = strToU8(relationships);
  entries[CONTENT_TYPES_XML] = strToU8(contentTypes);
}

function removeStaleCalculationChain(entries: ZipEntries) {
  delete entries[CALC_CHAIN_XML];
  const relationships = readXml(entries, WORKBOOK_RELS_XML).replace(
    /<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/?\s*>/g,
    '',
  );
  const contentTypes = readXml(entries, CONTENT_TYPES_XML).replace(
    /<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/?\s*>/g,
    '',
  );
  entries[WORKBOOK_RELS_XML] = strToU8(relationships);
  entries[CONTENT_TYPES_XML] = strToU8(contentTypes);
}

function removeExternalLinks(entries: ZipEntries) {
  for (const path of Object.keys(entries)) {
    if (path.startsWith('xl/externalLinks/')) delete entries[path];
  }
  entries[WORKBOOK_XML] = strToU8(readXml(entries, WORKBOOK_XML)
    .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/g, ''));
  entries[WORKBOOK_RELS_XML] = strToU8(readXml(entries, WORKBOOK_RELS_XML)
    .replace(/<Relationship\b[^>]*Type="[^"]*\/externalLink"[^>]*\/?\s*>/g, ''));
  entries[CONTENT_TYPES_XML] = strToU8(readXml(entries, CONTENT_TYPES_XML)
    .replace(/<Override\b[^>]*PartName="\/xl\/externalLinks\/[^"]+"[^>]*\/?\s*>/g, ''));
}

function readXml(entries: ZipEntries, path: string) {
  const entry = entries[path];
  if (!entry) throw new Error(`Thiếu thành phần ${path} trong file mẫu`);
  return strFromU8(entry);
}

function xmlAttribute(attributes: string, name: string) {
  const escapedName = name.replace(':', '\\:');
  return attributes.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`))?.[1];
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function formatMtcn(mtcn: string) {
  return mtcn.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
}

function formatDate(value?: string) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function visaTypeLabel(value?: string) {
  if (value === 'WORK_PERMIT') return 'Lao động / Work permit';
  if (value === 'TRC') return 'Thẻ tạm trú / TRC';
  return value ? 'Visa Du lịch / Tourist' : '';
}
