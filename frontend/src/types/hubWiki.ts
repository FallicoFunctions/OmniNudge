export interface HubWikiPage {
  id?: number;
  hub_id: number;
  slug: string;
  content: string;
  created_at?: string;
  updated_at?: string;
  updated_by?: number;
  exists: boolean;
}
