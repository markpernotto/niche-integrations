/**
 * JobNimbus webhook payload types.
 *
 * JobNimbus sends the full record object as the POST body when a webhook fires.
 * Phone/email can be a plain string or an array of value objects depending on
 * how the account is configured — we handle both.
 */

export interface JobNimbusPhone {
  value: string;
  type?: string; // "M" (mobile), "W" (work), "H" (home), etc.
}

export interface JobNimbusEmail {
  value: string;
  type?: string;
}

export interface JobNimbusContact {
  jnid: string;
  record_type: 'contact';
  first_name?: string;
  last_name?: string;
  company?: string;
  /** Can be a plain string or an array of {value, type} objects */
  phone?: string | JobNimbusPhone[];
  /** Can be a plain string or an array of {value, type} objects */
  email?: string | JobNimbusEmail[];
  address_line1?: string;
  city?: string;
  state_code?: string;
  zip?: string;
  status_name?: string;
  date_created?: number;
}

export interface JobNimbusJob {
  jnid: string;
  record_type: 'job';
  number?: number;
  /** Reference to the associated contact */
  customer?: string;
  type?: string;
  status_name?: string;
  date_created?: number;
}

/** Union of all record types the webhook may send */
export type JobNimbusRecord = JobNimbusContact | JobNimbusJob;
