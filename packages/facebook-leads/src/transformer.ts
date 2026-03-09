/**
 * Transform Facebook Lead Ads data to Niche lead format
 *
 * Niche API schema: { name, phone, info, source }
 * - name:   full name string
 * - phone:  phone number
 * - info:   all other fields (email, address, custom Q&A) as formatted text
 * - source: "FACEBOOK"
 */

import axios from 'axios';
import { CreateLeadRequest } from '@niche-integrations/core';
import { FacebookLeadData } from './types';

const GRAPH_API_VERSION = 'v21.0';

/**
 * Fetch full lead data from Facebook Graph API
 */
export async function fetchFacebookLeadData(
  leadId: string,
  accessToken: string
): Promise<FacebookLeadData> {
  const response = await axios.get<FacebookLeadData>(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadId}`,
    {
      params: {
        access_token: accessToken,
        fields: 'id,created_time,field_data',
      },
    }
  );
  return response.data;
}

/**
 * Extract field value from Facebook lead data
 */
function getFieldValue(leadData: FacebookLeadData, fieldName: string): string | undefined {
  const field = leadData.field_data.find((f) => f.name === fieldName);
  return field?.values?.[0];
}

/**
 * Build full name from available Facebook fields
 */
function buildName(leadData: FacebookLeadData): string | undefined {
  const firstName = getFieldValue(leadData, 'first_name') || getFieldValue(leadData, 'firstname');
  const lastName = getFieldValue(leadData, 'last_name') || getFieldValue(leadData, 'lastname');

  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
  }

  const fullName = getFieldValue(leadData, 'full_name') || getFieldValue(leadData, 'name');
  return fullName?.trim() || undefined;
}

/**
 * Extract phone from Facebook fields
 */
function extractPhone(leadData: FacebookLeadData): string | undefined {
  return getFieldValue(leadData, 'phone_number') || getFieldValue(leadData, 'phone');
}

/**
 * Build the info block: email, address, custom Q&A, and any other fields as formatted text.
 * Per spec, everything except name/phone goes here.
 */
function buildInfo(leadData: FacebookLeadData): string | undefined {
  const nameFields = new Set([
    'first_name', 'firstname', 'last_name', 'lastname', 'full_name', 'name',
  ]);
  const phoneFields = new Set(['phone_number', 'phone']);

  const lines: string[] = [];

  for (const field of leadData.field_data) {
    if (nameFields.has(field.name) || phoneFields.has(field.name)) continue;
    const value = field.values?.join(', ');
    if (!value) continue;

    // Use a readable label
    const label = field.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`${label}: ${value}`);
  }

  // Add Facebook metadata
  if (leadData.id) {
    lines.push(`Facebook Lead ID: ${leadData.id}`);
  }
  if (leadData.created_time) {
    lines.push(`Created: ${leadData.created_time}`);
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Transform Facebook lead to Niche lead format
 */
export function transformToNicheLead(
  leadData: FacebookLeadData,
  _source?: string
): CreateLeadRequest {
  return {
    name: buildName(leadData),
    phone: extractPhone(leadData),
    info: buildInfo(leadData),
    source: 'FACEBOOK',
  };
}
