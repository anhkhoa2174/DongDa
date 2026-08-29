import { Inject, Injectable } from '@nestjs/common';
import type { CreateDomesticTransferDto } from '../../dtos/domestic-transfer/domestic-transfer.dto';
import type {
  DomesticTransferFormExport,
  IDomesticTransferFormExporter,
} from '../../ports/domestic-transfer-form-exporter.port';

@Injectable()
export class ExportDomesticTransferFormUseCase {
  constructor(
    @Inject('IDomesticTransferFormExporter') private readonly exporter: IDomesticTransferFormExporter,
  ) {}

  execute(dto: CreateDomesticTransferDto): Promise<DomesticTransferFormExport> {
    return this.exporter.export(dto);
  }
}
