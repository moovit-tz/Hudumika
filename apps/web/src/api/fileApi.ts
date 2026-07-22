// src/api/fileApi.ts

/**
 * Simple wrapper around fetch for the File Manager backend.
 * Handles base URL, JSON headers and optional auth token.
 */
export const API_BASE = "/api/files"; // placeholder – replace with real endpoint if needed

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };
  // In a real app you would attach auth token here, e.g.:
  // const token = getAuthToken();
  // if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }
  // For DELETE that returns no body, we just return undefined
  if (response.status === 204) return undefined as unknown as T;
  return response.json();
}

// Exported CRUD helpers
export const fileApi = {
  getAll: () => apiRequest<FSItem[]>(""),
  createFile: (data: Omit<FSItem, "id">) => apiRequest<{ id: string }>("", { method: "POST", body: JSON.stringify(data) }),
  createFolder: (data: Omit<FSItem, "id">) => apiRequest<{ id: string }>("", { method: "POST", body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<FSItem>) => apiRequest<FSItem>(`/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteItem: (id: string) => apiRequest<void>(`/${id}`, { method: "DELETE" }),
  moveItem: (id: string, newParentId: string | null) => apiRequest<FSItem>(`/${id}/move`, { method: "POST", body: JSON.stringify({ parentId: newParentId }) }),
  shareItem: (id: string, users: string[]) => apiRequest<FSItem>(`/${id}/share`, { method: "POST", body: JSON.stringify({ users }) }),
};

// Type for FSItem – copied from store definition
export interface FSItem {
  id: string;
  name: string;
  type: string;
  size?: number;
  fileCount?: number;
  modified: string;
  created: string;
  parentId: string | null;
  shared?: string[];
  starred?: boolean;
  color?: string;
  description?: string;
  isTrash?: boolean;
  originalParentId?: string | null;
  workspaceId?: string | null;
  linkPassword?: string;
  linkExpires?: string;
  allowDownload?: boolean;
  allowImport?: boolean;
}
