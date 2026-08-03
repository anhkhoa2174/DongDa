import { httpClient } from '@/shared/api/httpClient';

export type DeactivateTransactionPayload = {
  reason: string;
};

export type UpdateTransactionMetadataPayload = {
  customerName?: string;
  customerPhone?: string;
  reason: string;
};

export type UpdatedTransactionMetadata = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  updatedAt: string;
};

export const transactionAdminApi = {
  deactivate: (transactionId: string, payload: DeactivateTransactionPayload) =>
    httpClient.post(`/transactions/${transactionId}/deactivate`, payload).then((response) => response.data),
  updateMetadata: (transactionId: string, payload: UpdateTransactionMetadataPayload) =>
    httpClient.patch<UpdatedTransactionMetadata>(`/transactions/${transactionId}/metadata`, payload)
      .then((response) => response.data),
};
