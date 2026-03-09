/**
 * Transform WordPress form data to Niche lead format
 *
 * Niche API schema: { name, phone, info, source }
 * - name:   full name string
 * - phone:  E.164 phone number
 * - info:   free-text block (email, message, and any extra fields go here)
 * - source: "WORDPRESS"
 */

import { CreateLeadRequest } from '@niche-integrations/core';

export interface WordPressFormData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  mobile?: string;
  message?: string;
  subject?: string;
  comments?: string;
  [key: string]: unknown;
}

/**
 * Normalize phone number to E.164-ish format
 */
function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return phone.startsWith('+') ? phone : `+${digits}`;
}

/**
 * Build the full name string from available fields
 */
function buildName(formData: WordPressFormData): string | undefined {
  if (formData.firstName || formData.lastName) {
    return [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || undefined;
  }
  if (formData.name) {
    return String(formData.name).trim() || undefined;
  }
  return undefined;
}

/**
 * Build the info block: email, message, and any extra fields as formatted text
 */
function buildInfo(formData: WordPressFormData): string | undefined {
  const knownFields = new Set([
    'name', 'firstName', 'lastName',
    'email', 'phone', 'phoneNumber', 'mobile',
    'message', 'subject', 'comments',
    'businessId', 'source',
  ]);

  const lines: string[] = [];

  // Email goes into info
  if (formData.email) {
    lines.push(`Email: ${String(formData.email).trim()}`);
  }

  // Message / subject / comments
  const message = formData.message || formData.subject || formData.comments;
  if (message) {
    lines.push(String(message).trim());
  }

  // Any extra fields
  for (const [key, value] of Object.entries(formData)) {
    if (!knownFields.has(key) && value !== undefined && value !== null && value !== '') {
      lines.push(`${key}: ${String(value)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Transform WordPress form data to Niche lead format
 */
export function transformToNicheLead(
  formData: WordPressFormData,
  _source?: string
): CreateLeadRequest {
  const phone = normalizePhone(
    (formData.phone || formData.phoneNumber || formData.mobile)
      ? String(formData.phone || formData.phoneNumber || formData.mobile).trim()
      : undefined
  );

  return {
    name: buildName(formData),
    phone,
    info: buildInfo(formData),
    source: 'WORDPRESS',
  };
}
