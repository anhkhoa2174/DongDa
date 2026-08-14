// OCR file Journal WU/MG dạng PDF scan -> text.
// Layer: Infrastructure — gọi binary hệ thống (pdftoppm của poppler + tesseract).
// Cần cài trong image: tesseract-ocr tesseract-ocr-data-vie tesseract-ocr-data-eng poppler-utils

import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFileP = promisify(execFile);

// PDF (nhiều trang) -> ảnh PNG 300dpi -> OCR từng trang -> ghép text.
export async function ocrPdfToText(buffer: Buffer): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-ocr-'));
  try {
    const pdfPath = path.join(dir, 'in.pdf');
    await fs.writeFile(pdfPath, buffer);

    // Tách trang thành ảnh: page-1.png, page-2.png, ...
    await execFileP('pdftoppm', ['-r', '300', '-png', pdfPath, path.join(dir, 'page')], {
      timeout: 120_000,
    });

    const pngs = (await fs.readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    if (pngs.length === 0) return '';

    let text = '';
    for (const png of pngs) {
      const { stdout } = await execFileP(
        'tesseract',
        [path.join(dir, png), 'stdout', '-l', 'vie+eng'],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      );
      text += stdout + '\n';
    }
    return text;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
