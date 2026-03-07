/**
 * Transform Facebook Lead Ads data to Niche lead format
 */

import axios from 'axios';
import { CreateLeadRequest } from '@niche-integrations/core';
import { FacebookLeadData } from './types';

/**
 * Fetch full lead data from Facebook Graph API
 */
export async function fetchFacebookLeadData(
  leadId: string,
  accessToken: string
): Promise<FacebookLeadData> {
  const response = await axios.get<FacebookLeadData>(
    `https://graph.facebook.com/v18.0/${leadId}`,
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
 * Transform Facebook lead to Niche lead format
 */
export function transformToNicheLead(
  leadData: FacebookLeadData,
  source: string = 'facebook-lead-ads'
): CreateLeadRequest {
  // Extract common fields
  const firstName = getFieldValue(leadData, 'first_name') || getFieldValue(leadData, 'firstname');
  const lastName = getFieldValue(leadData, 'last_name') || getFieldValue(leadData, 'lastname');
  const email = getFieldValue(leadData, 'email');
  const phone = getFieldValue(leadData, 'phone_number') || getFieldValue(leadData, 'phone');
  
  // Extract full name if separate fields not available
  let parsedFirstName = firstName;
  let parsedLastName = lastName;
  if (!firstName && !lastName) {
    const fullName = getFieldValue(leadData, 'full_name') || getFieldValue(leadData, 'name');
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      parsedFirstName = parts[0];
      parsedLastName = parts.slice(1).join(' ') || undefined;
    }
  }

  // Extract message/question responses
  const messageFields: string[] = [];
  const messageFieldNames = ['message', 'comments', 'question', 'additional_information'];
  
  for (const fieldName of messageFieldNames) {
    const value = getFieldValue(leadData, fieldName);
    if (value) {
      messageFields.push(value);
    }
  }

  // Build metadata from all fields
  const metadata: Record<string, unknown> = {
    facebookLeadId: leadData.id,
    facebookCreatedTime: leadData.created_time,
  };

  for (const field of leadData.field_data) {
    if (!['first_name', 'last_name', 'firstname', 'lastname', 'full_name', 'name', 'email', 'phone_number', 'phone', 'message', 'comments', 'question', 'additional_information'].includes(field.name)) {
      metadata[field.name] = field.values.join(', ');
    }
  }

  return {
    firstName: parsedFirstName,
    lastName: parsedLastName,
    email,
    phone,
    source,
    message: messageFields.length > 0 ? messageFields.join('\n\n') : undefined,
    metadata,
  };
}
