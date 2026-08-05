import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  IExchangeRateImageParser, ParsedExchangeRateCandidate,
} from '../../ports/exchange-rate-image-parser.port';

@Injectable()
export class ParseExchangeRateImageUseCase {
  constructor(
    @Inject('IExchangeRateImageParser') private readonly parser: IExchangeRateImageParser,
  ) {}

  async execute(file?: Express.Multer.File): Promise<{ rates: ParsedExchangeRateCandidate[] }> {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh bảng tỷ giá');
    const rates = await this.parser.parse({ bytes: file.buffer, mimeType: file.mimetype });
    if (rates.length === 0) {
      throw new BadRequestException('Không nhận dạng được tỷ giá hợp lệ trong ảnh');
    }
    return { rates };
  }
}
