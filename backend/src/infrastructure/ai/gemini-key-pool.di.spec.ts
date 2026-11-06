import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiExchangeRateParserService } from './gemini-exchange-rate-parser.service';
import { GeminiJournalParserService } from './gemini-journal-parser.service';
import { GeminiKeyPool } from './gemini-key-pool';

describe('GeminiKeyPool trong Nest DI', () => {
  it('đọc Journal và đọc ảnh tỷ giá dùng CHUNG một pool (hạn mức Google tính theo project)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: ConfigService, useValue: { get: () => undefined } },
        GeminiKeyPool,
        { provide: 'IExchangeRateImageParser', useClass: GeminiExchangeRateParserService },
        { provide: 'IJournalPdfParser', useClass: GeminiJournalParserService },
      ],
    }).compile();

    const pool = moduleRef.get(GeminiKeyPool);
    expect((moduleRef.get('IJournalPdfParser') as any).keys).toBe(pool);
    expect((moduleRef.get('IExchangeRateImageParser') as any).keys).toBe(pool);
  });
});
