/**
 * Facebook Lead Ads API types
 */

export interface FacebookLeadgenWebhook {
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      value: {
        leadgen_id: string;
        page_id: string;
        form_id: string;
        created_time: number;
        ad_id?: string;
        ad_name?: string;
      };
      field: string;
    }>;
  }>;
  object: 'leadgen';
}

export interface FacebookLeadData {
  id: string;
  created_time: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
}

export interface FacebookLeadResponse {
  data: FacebookLeadData[];
}
