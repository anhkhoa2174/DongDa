import type {
  CurrencyCode, ExchangeRateType, ServiceProvider,
} from '../../domain/entities/exchange-rate.entity';

export interface ParsedExchangeRateCandidate {
  rateType: ExchangeRateType;
  provider: ServiceProvider;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  confidence: number;
  sourceLabel: string;
  warning?: string;
}

export interface ExchangeRateImageInput {
  bytes: Buffer;
  mimeType: string;
}

export interface IExchangeRateImageParser {
  parse(input: ExchangeRateImageInput): Promise<ParsedExchangeRateCandidate[]>;
}
