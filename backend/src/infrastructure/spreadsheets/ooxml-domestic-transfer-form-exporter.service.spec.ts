import { readFile } from 'fs/promises';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { OoxmlDomesticTransferFormExporterService } from './ooxml-domestic-transfer-form-exporter.service';

const dto = {
  branchId: '00000000-0000-0000-0000-000000000001', transferType: 'CASH_TO_BANK' as const,
  bankAccountId: '00000000-0000-0000-0000-000000000002', customerName: 'NGUYEN VAN A',
  customerPhone: '0901234567', counterpartyBank: 'ACB', counterpartyAccount: '123456789',
  transferReference: 'CK-001', amount: 100_000, fee: 0, transferNote: 'THANH TOAN DON HANG',
};

describe('OoxmlDomesticTransferFormExporterService', () => {
  it('exports one worksheet and preserves the template visual parts', async () => {
    const template = unzipSync(await readFile(join(process.cwd(), 'src/assets/domestic-transfer-form-template.xlsx')));
    const result = await new OoxmlDomesticTransferFormExporterService().export(dto);
    const exported = unzipSync(result.buffer);
    const sheet = strFromU8(exported['xl/worksheets/sheet1.xml']);

    expect(Object.keys(exported).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)))
      .toEqual(['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('NGUYEN VAN A');
    expect(sheet).toContain('Một trăm nghìn đồng');
    expect(sheet).toContain('THANH TOAN DON HANG');
    expect(exported['xl/calcChain.xml']).toBeUndefined();
    for (const path of ['xl/styles.xml', 'xl/theme/theme1.xml', 'xl/media/image1.png', 'xl/drawings/drawing1.xml']) {
      expect(Buffer.from(exported[path])).toEqual(Buffer.from(template[path]));
    }
  });
});
