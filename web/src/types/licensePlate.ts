/**
 * License Plate Management Types
 */

export type LicensePlateListType = "whitelist" | "blacklist";

export interface LicensePlateListEntry {
  id: string;
  plate: string;
  list_type: LicensePlateListType;
  camera: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicensePlateEvent {
  id: string;
  plate: string;
  camera: string;
  list_status: LicensePlateListType | null;
  confidence: number;
  detected_at: string;
  object_id: string | null;
}

export interface AddPlateRequest {
  plate: string;
  list_type: LicensePlateListType;
  camera?: string;
  description?: string;
}

export interface UpdatePlateRequest {
  plate?: string;
  list_type?: LicensePlateListType;
  camera?: string;
  description?: string;
}
