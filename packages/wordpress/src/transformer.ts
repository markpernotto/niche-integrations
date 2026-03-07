/**
 * Transform WordPress form data to Niche lead format
 */

import { CreateLeadRequest } from '@niche-integrations/core';

export interface WordPressFormData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  message?: string;
  subject?: string;
  [key: string]: unknown;
}

/**
 * Extract name parts from a full name string
 */
function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Normalize phone number format
 */
function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If it starts with 1 and has 11 digits, it's US format
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  // If it has 10 digits, assume US format
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // Otherwise, add + if not present
  return phone.startsWith('+') ? phone : `+${digits}`;
}

/**
 * Transform WordPress form data to Niche lead format
 */
export function transformToNicheLead(
  formData: WordPressFormData,
  source: string = 'wordpress'
): CreateLeadRequest {
  // Extract name
  let firstName: string | undefined;
  let lastName: string | undefined;

  if (formData.firstName && formData.lastName) {
    firstName = String(formData.firstName).trim();
    lastName = String(formData.lastName).trim();
  } else if (formData.name) {
    const parsed = parseName(String(formData.name));
    firstName = parsed.firstName;
    lastName = parsed.lastName;
  }

  // Extract email
  const email = formData.email ? String(formData.email).trim() : undefined;

  // Extract phone (try multiple field names)
  const phone = normalizePhone(
    formData.phone || formData.phoneNumber || formData.mobile
      ? String(formData.phone || formData.phoneNumber || formData.mobile).trim()
      : undefined
  );

  // Extract message
  const message = formData.message || formData.subject || formData.comments;
  const messageText = message ? String(message).trim() : undefined;

  // Build metadata from remaining fields
  const metadata: Record<string, unknown> = {};
  const knownFields = ['name', 'firstName', 'lastName', 'email', 'phone', 'phoneNumber', 'mobile', 'message', 'subject', 'comments'];
  
  for (const [key, value] of Object.entries(formData)) {
    if (!knownFields.includes(key) && value !== undefined && value !== null && value !== '') {
      metadata[key] = value;
    }
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    source,
    message: messageText,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
