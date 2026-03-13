/**
 * AccuLynx webhook and API types.
 *
 * AccuLynx sends webhook events to our server when job milestones or statuses change.
 * We also support the lead creation endpoint for pushing leads into AccuLynx.
 *
 * Base URL: https://api.acculynx.com/api/v1
 * Auth: Bearer <ACCULYNX_API_KEY>
 * Webhook topics: job.milestone.changed, job.status.changed, job.approved_value.changed
 */

export interface AccuLynxContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface AccuLynxJob {
  id: string;
  jobNumber?: string;
  name?: string;
  status?: string;
  milestone?: string;
  /** Primary contact associated with this job */
  contact?: AccuLynxContact;
  /** Representative/salesperson name */
  repName?: string;
  tradeType?: string;
  approvedValue?: number;
  createdDate?: string;
  updatedDate?: string;
}

/** Webhook event envelope from AccuLynx */
export interface AccuLynxWebhookEvent {
  /** e.g. "job.milestone.changed", "job.status.changed" */
  topic: string;
  /** ISO timestamp of the event */
  occurredAt?: string;
  data: AccuLynxJob;
}
