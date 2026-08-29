import type { CreateWuDto } from '../dtos/wu/wu.dto';

export type WuFormBank = 'ACB' | 'MSB';

export interface WuFormExport {
  buffer: Buffer;
  filename: string;
}

export interface IWuFormExporter {
  export(bank: WuFormBank, dto: CreateWuDto): Promise<WuFormExport>;
}
