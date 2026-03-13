/**
 * Jobber GraphQL API types.
 *
 * Jobber uses GraphQL at https://api.getjobber.com/api/graphql
 * Auth: OAuth 2.0 Authorization Code flow
 * Tokens expire after 60 minutes; refresh tokens are used to renew.
 */

export interface JobberPhone {
  number: string;
  primary: boolean;
}

export interface JobberEmail {
  address: string;
  primary: boolean;
}

export interface JobberAddress {
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface JobberClient {
  id: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phones: JobberPhone[];
  emails: JobberEmail[];
  billingAddress?: JobberAddress;
  isLead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobberPageInfo {
  hasNextPage: boolean;
  endCursor?: string;
}

export interface JobberClientsPage {
  nodes: JobberClient[];
  pageInfo: JobberPageInfo;
}

export interface JobberClientsResponse {
  data: {
    clients: JobberClientsPage;
  };
  errors?: Array<{ message: string }>;
}

/** In-memory OAuth token store */
export interface JobberTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}
