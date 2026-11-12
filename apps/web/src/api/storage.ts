import { fetchWithAuth, buildApiUrl } from './auth';

export interface UploadResponse {
  objectKey: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface DownloadResponse {
  downloadUrl: string;
  objectKey: string;
  [key: string]: any;
}

export const uploadFileApi = async (
  entityType: 'payments' | 'project-acceptances' | 'service-period-acceptances' | 'projects' | 'orders',
  entityId: string | number,
  file: File,
): Promise<UploadResponse> => {
  // Validate client-side limit <= 10MB
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('Dung lượng tệp vượt quá giới hạn tối đa cho phép (10MB)');
  }

  // Send raw File directly using multipart/form-data (NO base64 conversion)
  const formData = new FormData();
  formData.append('entityType', entityType);
  formData.append('entityId', String(entityId));
  formData.append('filename', file.name);
  formData.append('file', file, file.name);

  const res = await fetchWithAuth(buildApiUrl('/storage/upload'), {
    method: 'POST',
    // Do NOT set Content-Type header so the browser sets multipart/form-data with boundary
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Tải tệp lên thất bại');
  }

  return res.json();
};

export const getPaymentProofApi = async (paymentId: string | number): Promise<DownloadResponse> => {
  const res = await fetchWithAuth(buildApiUrl(`/storage/payments/${paymentId}/proof`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể lấy chứng từ thanh toán');
  }
  return res.json();
};

export const getProjectAcceptanceEvidenceApi = async (projectId: string | number): Promise<DownloadResponse> => {
  const res = await fetchWithAuth(buildApiUrl(`/storage/projects/${projectId}/acceptance-evidence`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể lấy tài liệu nghiệm thu dự án');
  }
  return res.json();
};

export const getSubscriptionAcceptanceEvidenceApi = async (periodId: string | number): Promise<DownloadResponse> => {
  const res = await fetchWithAuth(buildApiUrl(`/storage/subscriptions/periods/${periodId}/acceptance-evidence`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể lấy tài liệu nghiệm thu kỳ dịch vụ');
  }
  return res.json();
};

export const getProjectAttachmentApi = async (projectId: string | number, attachmentId: string | number): Promise<DownloadResponse> => {
  const res = await fetchWithAuth(buildApiUrl(`/storage/projects/${projectId}/attachments/${attachmentId}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể lấy tệp đính kèm dự án');
  }
  return res.json();
};

