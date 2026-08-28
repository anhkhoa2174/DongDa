// PDF Builder — sinh file PDF từ ReportModel dùng jsPDF
// Layer: Application (không phụ thuộc framework)

import { jsPDF } from 'jspdf';
import type { ReportModel } from './report-model';

// jspdf-autotable v5 không tự patch jsPDF.prototype khi require như v3;
// phải gọi applyPlugin(jsPDF) một lần để có doc.autoTable(...)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyPlugin } = require('jspdf-autotable');
applyPlugin(jsPDF);

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export function buildPdfBuffer(model: ReportModel): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(model.title, 14, 20);

  let yOffset = 30;

  for (const sheet of model.sheets) {
    if (!sheet.aoa || sheet.aoa.length === 0) continue;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(sheet.name, 14, yOffset);
    yOffset += 5;

    const [head, ...body] = sheet.aoa;
    if (!head || head.length === 0) { yOffset += 5; continue; }

    doc.autoTable({
      startY: yOffset,
      head: [head.map(String)],
      body: body.map((row) => row.map((cell) =>
        cell === null || cell === undefined ? '' : String(cell),
      )),
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });

    yOffset = doc.lastAutoTable.finalY + 10;
    if (yOffset > 260 && model.sheets.indexOf(sheet) < model.sheets.length - 1) {
      doc.addPage();
      yOffset = 20;
    }
  }

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Trang ${i}/${pageCount}  |  Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// ── PDF Form GD WU ────────────────────────────────────────────────────────────
// Updated: Điều chỉnh Form GD WU, Xuất ra file PDF (preview trước khi tải)
export function buildWuFormPdf(tx: {
  transactionNo: string;
  businessDate: Date;
  mtcn: string;
  customerName?: string | null;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  wuRate: number;
  appliedRate: number;
  paidCurrency: string;
  payoutCurrency: string;
  profit: number;
}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PHIEU GIAO DICH WESTERN UNION', 14, 20);

  const fmt = (n: number, d = 2) =>
    n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });

  doc.autoTable({
    startY: 28,
    body: [
      ['So GD',           tx.transactionNo],
      ['Ngay',            tx.businessDate.toLocaleDateString('vi-VN')],
      ['MTCN',            tx.mtcn],
      ['Khach hang',      tx.customerName ?? '—'],
      ['WU USD',          `${fmt(tx.wuUsdAmount)} USD`],
      ['WU VND',          `${fmt(tx.wuVndAmount, 0)} VND`],
      ['Tra USD',         `${fmt(tx.receivedUsd)} USD`],
      ['Tra VND',         `${fmt(tx.receivedVnd, 0)} VND`],
      ['Ty gia WU',       fmt(tx.wuRate)],
      ['Ty gia ap dung',  fmt(tx.appliedRate)],
      ['Tien tra',        tx.payoutCurrency],
      ['Tien WU hoan',    tx.paidCurrency],
      ['Loi nhuan',       `${fmt(tx.profit, 0)} VND`],
    ],
    theme: 'striped',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  });

  const sigY = doc.lastAutoTable.finalY + 15;
  doc.setFontSize(9);
  doc.text('Nhan vien thuc hien', 20, sigY);
  doc.text('Quan ly chi nhanh', 100, sigY);

  return Buffer.from(doc.output('arraybuffer'));
}
