import { apiFetch } from "./api";

export type BrelaObjectType = "ET-COMPANY" | "ET-BUSINESS";

export interface BrelaRecord {
  id: number;
  cert_number: string;
  reg_date: string | null;
  incorporation_date: string | null;
  legal_name: string;
  subtype_name: string | null;
  object_type: BrelaObjectType;
  reg_status: string;
  reg_status_name: string;
  address: string | null;
}

export async function searchBrela(params: {
  objectType: BrelaObjectType;
  number?: string;
  name?: string;
}): Promise<BrelaRecord[]> {
  const data = await apiFetch("/organizations/brela-search", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.results ?? [];
}
