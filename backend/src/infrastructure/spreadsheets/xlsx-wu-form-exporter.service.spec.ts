import { readFile } from 'fs/promises';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { XlsxWuFormExporterService } from './xlsx-wu-form-exporter.service';

const dto = {
  branchId: '00000000-0000-0000-0000-000000000001', mtcn: '2751454064',
  bankAccountId: '00000000-0000-0000-0000-000000000010',
  customerName: 'ALEX ROBERTS', customerPhone: '0783269349', sendingCountry: 'AUSTRALIA',
  receiverDateOfBirth: '1983-06-21', currentAddress: '97DUONG 66 P THAO DIEN Q2',
  identityDocumentType: 'PASSPORT', identityDocumentNumber: '146171983',
  identityIssuingCountry: 'UNITED KINGDOM', identityIssueDate: '2024-04-11', identityExpiryDate: '2034-04-11',
  hasVisa: true, visaNumber: 'F-146171983', visaIssueDate: '2025-05-17', visaExpiryDate: '2025-06-30',
  employmentStatus: 'Nghề tự do / Freelancer', countryOfBirth: 'UNITED KINGDOM',
  senderRelationship: 'Gia đình (FAMILY)', receivePurpose: 'Chi phí đi lại (TRAVEL EXPENSE)',
  senderName: 'JAY ROBERTS', receivedDate: '2025-06-20', wuUsdAmount: 156.98,
  wuVndAmount: 4_100_000, receivedUsd: 156, receivedVnd: 25_000, appliedRate: 25_500,
  payoutCurrency: 'VND', paidCurrency: 'USD',
};

describe('XlsxWuFormExporterService', () => {
  it('only changes workbook and populated sheet XML while preserving every visual part byte-for-byte', async () => {
    const template = unzipSync(await readFile(join(process.cwd(), 'src/assets/wu-form-template.xlsx')));
    const result = await new XlsxWuFormExporterService().export('ACB', dto);
    const exported = unzipSync(result.buffer);
    expect(exported['xl/calcChain.xml']).toBeUndefined();
    expect(Object.keys(exported).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)))
      .toEqual(['xl/worksheets/sheet2.xml']);
    for (const path of ['xl/styles.xml', 'xl/theme/theme1.xml', 'xl/media/image1.png', 'xl/media/image2.png', 'xl/drawings/drawing2.xml']) {
      expect(Buffer.from(exported[path])).toEqual(Buffer.from(template[path]));
    }
    const sheet = strFromU8(exported['xl/worksheets/sheet2.xml']);
    expect(sheet).toContain('275-145-4064');
    expect(sheet).toContain('ALEX ROBERTS');
    expect(sheet).toMatch(/<c[^>]*r="D11"[^>]*><v>156\.98<\/v><\/c>/);
    expect(sheet).toMatch(/<c[^>]*r="M11"[^>]*>[\s\S]*?<t[^>]*>USD<\/t>/);
    expect(strFromU8(exported['xl/workbook.xml'])).toContain('name="PHIẾU ACB (NƯỚC NGOÀI)" sheetId="6" r:id="rId2"/>');
    expect((strFromU8(exported['xl/workbook.xml']).match(/<sheet\b/g) ?? [])).toHaveLength(1);
    expect(strFromU8(exported['xl/_rels/workbook.xml.rels'])).not.toContain('calcChain');
  });

  it('uses the VND WU amount when Paid Currency is VND on the MSB form', async () => {
    const result = await new XlsxWuFormExporterService().export('MSB', {
      ...dto,
      payoutCurrency: 'USD',
      paidCurrency: 'VND',
    });
    const sheet = strFromU8(unzipSync(result.buffer)['xl/worksheets/sheet6.xml']);
    expect(sheet).toMatch(/<c[^>]*r="D18"[^>]*><v>4100000<\/v><\/c>/);
    expect(sheet).toMatch(/<c[^>]*r="I18"[^>]*>[\s\S]*?<t[^>]*>VND<\/t>/);
  });
});
