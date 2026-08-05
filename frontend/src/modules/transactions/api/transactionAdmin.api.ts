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

export type TransactionAdjustmentRequest = {
  id: string;
  entity_id: string;
  requested_by_user_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  note?: string | null;
  requested_at: string;
  completed_at?: string | null;
  users?: {
    username?: string;
    employees?: { full_name?: string };
  };
  transaction?: {
    transaction_no: string;
    operation_code: string;
    status: string;
    branches?: { code: string; name: string };
    shifts?: { shift_code: string; status: string };
  } | null;
};

export const transactionAdminApi = {
  deactivate: (transactionId: string, payload: DeactivateTransactionPayload) =>
    httpClient.post(`/transactions/${transactionId}/deactivate`, payload).then((response) => response.data),
  updateMetadata: (transactionId: string, payload: UpdateTransactionMetadataPayload) =>
    httpClient.patch<UpdatedTransactionMetadata>(`/transactions/${transactionId}/metadata`, payload)
      .then((response) => response.data),
  listAdjustmentRequests: (status?: string) =>
    httpClient.get<TransactionAdjustmentRequest[]>('/transactions/adjustment-requests', { params: { status } })
      .then((response) => response.data),
  createAdjustmentRequest: (
    transactionId: string,
    payload: { reason: string; proposedCorrection?: string },
  ) => httpClient.post(`/transactions/${transactionId}/adjustment-requests`, payload)
    .then((response) => response.data),
  approveAdjustmentRequest: (requestId: string, reason: string) =>
    httpClient.post(`/transactions/adjustment-requests/${requestId}/approve`, { reason })
      .then((response) => response.data),
  rejectAdjustmentRequest: (requestId: string, reason: string) =>
    httpClient.post(`/transactions/adjustment-requests/${requestId}/reject`, { reason })
      .then((response) => response.data),
};
