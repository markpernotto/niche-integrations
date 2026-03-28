/**
 * Types for the HubSpot outbound integration.
 * Direction: Niche → HubSpot
 */

// Full Niche lead object (superset of core NicheLead type)
export interface NicheLeadFull {
  id: string;
  name?: string;
  phone?: string;
  info?: string;
  typeOfWorkCategory?: string;
  source?: string;
  eligibleForConversion?: boolean;
  maskedEmail?: string;
  done?: boolean;
  hasTemporaryNumber?: boolean;
  sentToBusiness?: boolean;
  outboundCallInitiated?: boolean;
  isOffered?: boolean;
  isOfferedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Niche call from GET /businesses/{businessId}/calls
export interface NicheCall {
  id: string;
  type?: 'INBOUND' | 'OUTBOUND';
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  start?: string;
  end?: string;
  leadId?: string;
  summary?: string;
  transcript?: string;
  duration?: number; // seconds
  recordingUrl?: string;
}

// Niche paginated response envelope
export interface NichePagedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

// HubSpot contact properties for create/update
export interface HubSpotContactProps {
  firstname?: string;
  lastname?: string;
  phone?: string;
  email?: string;
  niche_lead_id?: string;
}

// HubSpot deal properties for create
export interface HubSpotDealProps {
  dealname: string;
  pipeline?: string;
  dealstage?: string;
}

// HubSpot call engagement properties
export interface HubSpotCallProps {
  hs_call_title: string;
  hs_call_direction: string;
  hs_call_status: string;
  hs_call_duration?: string; // milliseconds as string
  hs_call_body?: string;
  hs_call_recording_url?: string;
  hs_timestamp: string;
}

// Generic HubSpot CRM object response
export interface HubSpotObject {
  id: string;
  properties: Record<string, string | undefined>;
  createdAt?: string;
  updatedAt?: string;
}
