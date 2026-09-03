import type { CreateDomesticTransferDto } from '../dtos/domestic-transfer/domestic-transfer.dto';

export interface DomesticTransferFormExport {
  buffer: Buffer;
  filename: string;
}

export interface IDomesticTransferFormExporter {
  export(dto: CreateDomesticTransferDto): Promise<DomesticTransferFormExport>;
}
