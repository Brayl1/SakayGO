import type { Point } from "./model";
export interface CatalogRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  source: string;
  sourceUpdated: string;
  visible: boolean;
  status: "unverified" | "under_review" | "approved";
  // Private admin notes are omitted from public catalog responses.
  reviewNotes?: string;
  reviewedAt: string;
  roads: string[];
  directions: string[];
  geometry?: Record<string, Point[]>;
  roadsByDirection?: Record<string, string[]>;
  routeIdentifier?: string;
  signboardCode?: string;
  license?: string;
  operationalStatus?: string;
  fieldVerification?: Record<string, string>;
  missingDirections?: string[];
  verifiedCodes?: Record<string, string[]>;
}
export interface SiteSettings {
  headline: string;
  description: string;
  announcement: string;
  maintenance: boolean;
}
export interface CatalogState {
  routes: CatalogRoute[];
  settings: SiteSettings;
  updatedAt: string;
  revision: number;
}
export const defaultSettings: SiteSettings = {
  headline: "Where to today?",
  description:
    "Explore jeepney routes around Cagayan de Oro. A little local knowledge for your next sakay.",
  announcement: "",
  maintenance: false,
};
