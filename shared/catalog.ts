import type { Point } from "./model";
export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
  type: string;
}
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
  /** CDO LPTRP route state: "unverified" | "not_yet_operational" | "for_clarification". */
  operationalStatus?: string;
  /** Landmarks named along the route in the LPTRP description. */
  landmarks?: string[];
  /** Places where the route meets others, per the source dataset. */
  transferPoints?: string[];
  /** Reference points from the route plan (areas, markets, terminals); not designated stops. */
  stops?: RouteStop[];
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
