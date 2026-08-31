import { httpClient } from '@/shared/api/httpClient';

export interface WuTransactionDto {
  id: string;
  transactionNo: string;
  branchId: string;
  bankAccountId: string;
  shiftCode?: string;
  status: string;
  debtStatus?: 'PENDING' | 'RECONCILED' | 'SETTLED' | 'CANCELLED';
  customerName?: string | null;
  customerPhone?: string | null;
  sendingCountry?: string | null;
  senderState?: string | null;
  receiverDateOfBirth?: string | null;
  currentAddress?: string | null;
  identityAddress?: string | null;
  identityDocumentType?: string | null;
  identityDocumentNumber?: string | null;
  identityIssuingCountry?: string | null;
  identityIssueDate?: string | null;
  identityExpiryDate?: string | null;
  hasVisa: boolean;
  visaType?: string | null;
  visaNumber?: string | null;
  visaIssueDate?: string | null;
  visaExpiryDate?: string | null;
  employmentStatus?: string | null;
  countryOfBirth?: string | null;
  senderRelationship?: string | null;
  receivePurpose?: string | null;
  senderName?: string | null;
  receivedDate?: string | null;
  mtcn: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  wuRate: number;
  systemRate: number;
  appliedRate: number;
  paidCurrency: 'USD' | 'VND';
  payoutCurrency: 'USD' | 'VND';
  transactionValueVnd: number;
  createdAt: string;
}

export interface CreateWuPayload {
  branchId: string;
  bankAccountId: string;
  mtcn: string;
  customerName?: string;
  customerPhone: string;
  sendingCountry: string;
  senderState?: string;
  receiverDateOfBirth: string;
  currentAddress: string;
  identityAddress?: string;
  identityDocumentType: string;
  identityDocumentNumber: string;
  identityIssuingCountry: string;
  identityIssueDate: string;
  identityExpiryDate: string;
  hasVisa: boolean;
  visaNumber?: string;
  visaIssueDate?: string;
  visaExpiryDate?: string;
  employmentStatus: string;
  countryOfBirth: string;
  senderRelationship: string;
  receivePurpose: string;
  senderName: string;
  receivedDate: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd: number;
  receivedVnd: number;
  appliedRate: number;
  payoutCurrency: string;
  paidCurrency: string;
}

export const wuApi = {
  list: (branchId?: string) =>
    httpClient.get<WuTransactionDto[]>('/wu/transactions', { params: { branchId } }).then((r) => r.data),
  create: (payload: CreateWuPayload) =>
    httpClient.post<WuTransactionDto>('/wu/transactions', payload).then((r) => r.data),
  exportForm: (bank: 'ACB' | 'MSB', payload: CreateWuPayload) =>
    httpClient.post<Blob>(`/wu/transactions/forms/${bank}`, payload, { responseType: 'blob' }).then((r) => r.data),
};
