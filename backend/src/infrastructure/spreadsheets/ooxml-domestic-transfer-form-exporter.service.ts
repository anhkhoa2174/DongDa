import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { CreateDomesticTransferDto } from '../../application/dtos/domestic-transfer/domestic-transfer.dto';
import type {
  DomesticTransferFormExport,
  IDomesticTransferFormExporter,
} from '../../application/ports/domestic-transfer-form-exporter.port';
import { vndAmountInWords } from '../../domain/entities/vietnamese-money-words';

const TEMPLATE_PATH = join(process.cwd(), 'src', 'assets', 'domestic-transfer-form-template.xlsx');
type Entries = Record<string, Uint8Array>;

@Injectable()
export class OoxmlDomesticTransferFormExporterService implements IDomesticTransferFormExporter {
  async export(dto: CreateDomesticTransferDto): Promise<DomesticTransferFormExport> {
    try {
      const entries = unzipSync(await readFile(TEMPLATE_PATH));
      let sheet = xml(entries, 'xl/worksheets/sheet1.xml');
      const cells: Record<string, string | number> = {
        C9: dto.customerName?.trim() ?? '',
        H9: dto.customerName?.trim() ?? '',
        C11: dto.counterpartyAccount?.trim() ?? '',
        C13: dto.counterpartyBank?.trim() ?? '',
        C14: dto.amount,
        C16: vndAmountInWords(dto.amount),
        C17: dto.transferNote?.trim() ?? '',
        H13: dto.customerPhone?.trim() ?? '',
        J2: dto.transferReference.trim(),
      };
      for (const [address, value] of Object.entries(cells)) sheet = replaceCell(sheet, address, value);
      entries['xl/worksheets/sheet1.xml'] = strToU8(sheet);
      prunePackage(entries);
      return {
        buffer: Buffer.from(zipSync(entries, { level: 6 })),
        filename: `GIAY-CHUYEN-KHOAN-${safeFilename(dto.transferReference)}.xlsx`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Không thể tạo giấy chuyển khoản: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }
}

function prunePackage(entries: Entries) {
  for (const path of [
    'xl/worksheets/sheet2.xml', 'xl/worksheets/_rels/sheet2.xml.rels', 'xl/calcChain.xml',
    'xl/externalLinks/externalLink1.xml', 'xl/externalLinks/_rels/externalLink1.xml.rels',
    'xl/printerSettings/printerSettings2.bin',
  ]) delete entries[path];

  let workbook = xml(entries, 'xl/workbook.xml')
    .replace(/<sheets>[\s\S]*?<\/sheets>/, '<sheets><sheet name="GIẤY CHUYỂN KHOẢN" sheetId="1" r:id="rId1"/></sheets>')
    .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '')
    .replace(/<calcPr\b([^>]*)\/?\s*>/, (_tag, attrs: string) => {
      const clean = attrs.replace(/\s+(?:calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '').replace(/\/\s*$/, '');
      return `<calcPr${clean} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
    });
  workbook = workbook.replace(/(<workbookView\b[^>]*?)\sactiveTab="\d+"/, '$1 activeTab="0"');
  entries['xl/workbook.xml'] = strToU8(workbook);

  entries['xl/_rels/workbook.xml.rels'] = strToU8(xml(entries, 'xl/_rels/workbook.xml.rels').replace(
    /<Relationship\b[^>]*Type="[^"]*\/(?:calcChain|externalLink|worksheet)"[^>]*\/?\s*>/g,
    (tag) => tag.includes('Id="rId1"') ? tag : '',
  ));
  entries['[Content_Types].xml'] = strToU8(xml(entries, '[Content_Types].xml').replace(
    /<Override\b[^>]*PartName="\/(?:xl\/calcChain\.xml|xl\/externalLinks\/externalLink1\.xml|xl\/worksheets\/sheet2\.xml)"[^>]*\/?\s*>/g,
    '',
  ));
}

function replaceCell(source: string, address: string, value: string | number) {
  const pattern = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)(?:\\s*/>|>[\\s\\S]*?<\\/c>)`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Không tìm thấy ô ${address} trong file mẫu`);
  const attrs = match[1].replace(/\s+t="[^"]*"/g, '').replace(/\/\s*$/, '');
  const cell = typeof value === 'number'
    ? `<c${attrs}><v>${value}</v></c>`
    : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  return source.replace(pattern, cell);
}

function xml(entries: Entries, path: string) {
  if (!entries[path]) throw new Error(`Thiếu thành phần ${path} trong file mẫu`);
  return strFromU8(entries[path]);
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'PHIEU';
}
