export type Point = [number, number];
export type Passenger = "regular" | "student" | "senior" | "pwd";
export interface Location {
  id: string;
  name: string;
  category: string;
  point: Point;
}
export interface Policy {
  id: string;
  source: string;
  effective: string;
  expires: string;
  demo: boolean;
  base: number;
  baseKm: number;
  perKm: number;
  discount: number;
  roundTo: number;
}
export interface Service {
  id: string;
  name: string;
  signboard: string;
  area: string;
  direction: string;
  status: "demo" | "verified" | "unverified";
  verifiedAt: string | null;
  source: string;
  stops: string[];
  geometry: Point[];
  policyId: string;
  pickup?: boolean[];
  dropoff?: boolean[];
}
export interface Dataset {
  locations: Location[];
  routes: Service[];
  policies: Policy[];
}
export interface Ride {
  route: Service;
  from: Location;
  to: Location;
  points: Point[];
  km: number;
  fare: number | null;
}
export interface Journey {
  id: string;
  rides: Ride[];
  transfers: number;
  fare: number | null;
  walking: number;
}
