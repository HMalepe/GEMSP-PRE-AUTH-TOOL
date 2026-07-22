import { loadStoredUser } from '../auth/current-user-storage';
import type {
  AppUser,
  AuthDecisionDetail,
  AuthDecisionPayload,
  AuthDecisionSummary,
  AuthRequestInput,
  Icd10SearchResult,
  MemberLookupResult,
  ModifierSearchResult,
  NappiSearchResult,
  NetworkProviderSearchResult,
  OverrideRecordPayload,
  QueueItemDetail,
  QueueItemSummary,
  TariffSearchResult,
} from './types';

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Every call attaches X-User-Id for the currently-selected account (backend/src/security/auth.ts) — a no-op header if none is selected yet, which the backend then rejects with 401. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = loadStoredUser();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(user ? { 'x-user-id': user.userId } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `request failed with status ${res.status}`, res.status, body.details);
  }
  return res.json() as Promise<T>;
}

/** Unauthenticated on the backend on purpose — the account picker needs this before any account is selected. */
export function listUsers(): Promise<AppUser[]> {
  return request('/users');
}

function query(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      usp.set(key, String(value));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export function searchIcd10(q: string, year: number): Promise<Icd10SearchResult[]> {
  return request(`/reference-data/icd10${query({ q, year })}`);
}
export function searchTariff(q: string, year: number): Promise<TariffSearchResult[]> {
  return request(`/reference-data/tariff${query({ q, year })}`);
}
export function searchNappi(q: string, year: number): Promise<NappiSearchResult[]> {
  return request(`/reference-data/nappi${query({ q, year })}`);
}
export function searchNetworkProviders(q: string, year: number): Promise<NetworkProviderSearchResult[]> {
  return request(`/reference-data/network-providers${query({ q, year })}`);
}
export function searchModifiers(q: string, year: number): Promise<ModifierSearchResult[]> {
  return request(`/reference-data/modifiers${query({ q, year })}`);
}

export function getMember(memberId: string, serviceDate?: string): Promise<MemberLookupResult> {
  return request(`/members/${encodeURIComponent(memberId)}${query({ serviceDate })}`);
}

export function submitAuthorisation(input: AuthRequestInput): Promise<AuthDecisionPayload> {
  return request('/authorisations', { method: 'POST', body: JSON.stringify(input) });
}

export function getAuthDecision(authId: string): Promise<AuthDecisionDetail> {
  return request(`/auth-decisions/${encodeURIComponent(authId)}`);
}

export function searchAuthDecisions(filters: {
  memberId?: string;
  authId?: string;
  code?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuthDecisionSummary[]> {
  return request(`/auth-decisions${query(filters)}`);
}

export function recordOverride(authId: string, params: { overriddenBy: string; reason: string }): Promise<OverrideRecordPayload> {
  return request(`/auth-decisions/${encodeURIComponent(authId)}/override`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function listReviewQueue(): Promise<QueueItemSummary[]> {
  return request('/review-queue');
}

export function getReviewQueueItem(authId: string): Promise<QueueItemDetail> {
  return request(`/review-queue/${encodeURIComponent(authId)}`);
}

export function resolveReviewQueueItem(
  authId: string,
  params: { reviewer: string; outcome: 'APPROVED' | 'DECLINED' | 'MORE_INFO_REQUESTED'; reason: string },
): Promise<{ status: string }> {
  return request(`/review-queue/${encodeURIComponent(authId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
