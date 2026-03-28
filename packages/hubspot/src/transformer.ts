/**
 * Pure transformation functions: Niche → HubSpot
 * No network calls — all functions are deterministic and testable.
 */

import type {
  NicheLeadFull,
  NicheCall,
  HubSpotContactProps,
  HubSpotDealProps,
  HubSpotCallProps,
} from './types';

/**
 * Extract email from an info block formatted as "Email: user@example.com"
 */
export function extractEmailFromInfo(info?: string): string | undefined {
  if (!info) return undefined;
  const match = info.match(/Email:\s*([^\s|,\n]+)/i);
  const email = match?.[1]?.trim();
  if (!email || email.endsWith('.invalid')) return undefined;
  return email;
}

/**
 * Split a full name string into first/last.
 */
export function splitName(name?: string): { firstname?: string; lastname?: string } {
  if (!name?.trim()) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0] };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

/**
 * Map a Niche lead to HubSpot contact create/update properties.
 */
export function nicheLeadToContactProps(lead: NicheLeadFull): HubSpotContactProps {
  const { firstname, lastname } = splitName(lead.name);
  const email = extractEmailFromInfo(lead.info);
  return {
    ...(firstname ? { firstname } : {}),
    ...(lastname ? { lastname } : {}),
    ...(lead.phone ? { phone: lead.phone } : {}),
    ...(email ? { email } : {}),
    niche_lead_id: lead.id,
  };
}

/**
 * Map a Niche lead to HubSpot deal create properties.
 */
export function nicheLeadToDealProps(
  lead: NicheLeadFull,
  pipeline?: string,
  dealstage?: string
): HubSpotDealProps {
  return {
    dealname: lead.name ? `${lead.name} — Niche Lead` : `Niche Lead ${lead.id}`,
    ...(pipeline ? { pipeline } : {}),
    ...(dealstage ? { dealstage } : {}),
  };
}

/**
 * Map a Niche call to HubSpot call engagement properties.
 * duration is in seconds; HubSpot expects milliseconds.
 */
export function nicheCallToEngagementProps(call: NicheCall): HubSpotCallProps {
  const durationMs =
    call.duration != null ? String(Math.round(call.duration * 1000)) : undefined;
  const body =
    [call.summary, call.transcript].filter(Boolean).join('\n\n') || undefined;

  return {
    hs_call_title: `Niche ${call.type ?? 'INBOUND'} Call`,
    hs_call_direction: call.type ?? 'INBOUND',
    hs_call_status: 'COMPLETED',
    ...(durationMs ? { hs_call_duration: durationMs } : {}),
    ...(body ? { hs_call_body: body } : {}),
    ...(call.recordingUrl ? { hs_call_recording_url: call.recordingUrl } : {}),
    hs_timestamp: call.start ?? new Date().toISOString(),
  };
}
