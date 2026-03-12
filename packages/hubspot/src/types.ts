/**
 * HubSpot webhook event payload (array of subscription events)
 * https://developers.hubspot.com/docs/api/webhooks
 */
export interface HubSpotWebhookEvent {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  appId: number;
  occurredAt: number;
  subscriptionType: string; // e.g. "contact.creation", "contact.propertyChange"
  attemptNumber: number;
  objectId: number; // contactId
  changeSource?: string;
  changeFlag?: string;
  propertyName?: string;
  propertyValue?: string;
}

/**
 * HubSpot contact properties from CRM API v3
 */
export interface HubSpotContactProperties {
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  mobilephone?: string;
  company?: string;
  jobtitle?: string;
  city?: string;
  state?: string;
  message?: string;
  [key: string]: string | undefined;
}

export interface HubSpotContact {
  id: string;
  properties: HubSpotContactProperties;
  createdAt: string;
  updatedAt: string;
}
