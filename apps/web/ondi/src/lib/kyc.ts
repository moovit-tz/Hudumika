import { apiFetch, API_URL } from './api';

export type KycDocType = 'NIN' | 'PASSPORT' | 'DRIVER_LICENSE';

export interface KycSubmitParams {
  firstName: string;
  lastName: string;
  nin: string;
  documentType: KycDocType;
}

export async function submitKyc(params: KycSubmitParams): Promise<{ submissionId: string }> {
  return apiFetch('/kyc/submit', { method: 'POST', body: JSON.stringify(params) });
}

/** Real multipart upload — apiFetch always sets Content-Type: application/json,
 *  which breaks FormData, so this talks to the API directly. */
export async function uploadKycDocument(submissionId: string, file: File): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_URL}/kyc/submissions/${submissionId}/document`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'document_upload_failed');
  }
}

export async function completeKycUpload(submissionId: string): Promise<void> {
  await apiFetch('/kyc/complete-upload', {
    method: 'POST',
    body: JSON.stringify({ submissionId }),
  });
}

export async function getKycStatus(): Promise<{ status?: string }> {
  return apiFetch('/kyc/status');
}

/** The verification job runs ~2s after complete-upload — poll a few times with
 *  a short backoff rather than guessing a fixed delay. Returns the terminal
 *  status (VERIFIED/REJECTED) or the last-seen status if it never resolved. */
export async function pollKycStatus(attempts = 6, delayMs = 900): Promise<string> {
  let finalStatus = 'REVIEW';
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    const status = await getKycStatus();
    finalStatus = status?.status ?? 'REVIEW';
    if (finalStatus === 'VERIFIED' || finalStatus === 'REJECTED') break;
  }
  return finalStatus;
}

/**
 * Full submit flow shared by the registration KYC screen
 * ((auth)/register/personal/kyc) and the wallet's "add document" modal
 * (dashboard/personal/wallet) — previously two independent, drifted
 * implementations, one of which silently never uploaded its attached photo.
 *
 * `file` is optional, mirroring the mobile app's upload-vs-manual KYC modes
 * (features/onboarding/screens/document_kyc_screen.dart): with a photo, the
 * backend's real OCR/MRZ pipeline can verify it; without one, the submission
 * just stays in REVIEW for a human (services/ondi-api/src/routes/kyc.ts) —
 * not an error, a real pending state.
 */
export async function runKycSubmission(
  params: KycSubmitParams & { file?: File | null },
): Promise<{ submissionId: string; status: string }> {
  const { file, ...submitParams } = params;
  const { submissionId } = await submitKyc(submitParams);
  if (file) await uploadKycDocument(submissionId, file);
  await completeKycUpload(submissionId);
  const status = await pollKycStatus();
  return { submissionId, status };
}
