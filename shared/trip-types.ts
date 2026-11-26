import type { Point } from "./model";
export interface Place {
  label: string;
  point: Point;
  source: string;
}
export interface Walk {
  from: Point;
  to: Point;
  geometry: Point[];
  distanceMeters: number;
  method: string;
  note: string;
}
export interface TripLeg {
  routeId: string;
  label: string;
  direction: string;
  board: Point;
  alight: Point;
  rideMeters: number;
  geometry: Point[];
  codes: string[];
  roads: string[];
  source: string;
  vehicleType: "unknown" | "traditional" | "modern";
  boardAlongMeters: number;
  alightAlongMeters: number;
  referenceFares: ReferenceFare[];
  fare:
    | null
    | (FareBreakdown & {
        source: string;
        effective: string;
        vehicle: string;
        passenger: string;
      });
  boardingStatus: string;
}
export interface Trip {
  id: string;
  legs: TripLeg[];
  walks: Walk[];
  transfers: number;
  walkingMeters: number;
  rideMeters: number;
  totalMeters: number;
  referenceFare: null | {
    status: string;
    minimum: number;
    maximum: number;
    scenarios: {
      vehicles: string[];
      rides: ReferenceFare[];
      minimum: number;
      maximum: number;
    }[];
  };
  sharesRideWith?: string[];
  confidence: string;
  fare: number | null;
}
export interface TripResult {
  trips: Trip[];
  reason?: string;
  caveats?: string[];
  transferNote?: string;
  limits: {
    maxWalkMeters: number;
    minRideMeters: number;
    maxResults: number;
    maxTransferWalkMeters: number;
  };
}
export interface ResearchCode {
  code: string;
  reported_service_area: string;
  source_type: string;
  verification_status: string;
  source_url: string;
  notes: string;
}
export interface FareBreakdown {
  amount: number;
  amountCents: number;
  distanceMeters: number;
  baseFare: number;
  baseDistanceKm: number;
  additionalDistanceKm: number;
  additionalCharge: number;
  undiscounted: number;
  discount: number;
  discountAmount: number;
  afterDiscount: number;
  roundingAdjustment: number;
  rounding: string;
  roundTo: number;
  incrementMode: string;
  matrixApplied: boolean;
}
export interface ReferenceFare {
  vehicle: "traditional" | "modern";
  classification: string;
  distanceMeters: number;
  lowerKm: number;
  upperKm: number;
  lower: FareBreakdown;
  upper: FareBreakdown;
  minimum: number;
  maximum: number;
  effective: string;
  datasetId: string;
  sources: string[];
  note: string;
  status: string;
}
