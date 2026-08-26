import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreateWuDto } from '../../dtos/wu/wu.dto';
import type { IWuFormExporter, WuFormBank, WuFormExport } from '../../ports/wu-form-exporter.port';

@Injectable()
export class ExportWuFormUseCase {
  constructor(@Inject('IWuFormExporter') private readonly exporter: IWuFormExporter) {}

  execute(bank: string, dto: CreateWuDto): Promise<WuFormExport> {
    const normalizedBank = bank.toUpperCase();
    if (normalizedBank !== 'ACB' && normalizedBank !== 'MSB') {
      throw new BadRequestException('Chỉ hỗ trợ xuất phiếu ACB hoặc MSB');
    }
    return this.exporter.export(normalizedBank as WuFormBank, dto);
  }
}
