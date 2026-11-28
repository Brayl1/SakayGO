import type { CatalogRoute } from "../shared/catalog";

/** Human label for a route's LPTRP operational state, or null when ordinary. */
export function operationalLabel(route: Pick<CatalogRoute, "operationalStatus">) {
  if (route.operationalStatus === "not_yet_operational") return { label: "Not yet operational", tone: "warning" as const };
  if (route.operationalStatus === "for_clarification") return { label: "For clarification", tone: "notice" as const };
  return null;
}
