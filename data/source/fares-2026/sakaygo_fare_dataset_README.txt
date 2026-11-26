SAKAYGO FARE DATASET — September 28, 2026 published rates

FILES
- sakaygo_fare_rules_2026.json: machine-readable fare rules, sources, discounts, limitations
- sakaygo_fare_rules_2026.csv: flat vehicle-type fare rate table
- sakaygo_fare_lookup_1_to_30km.csv: example computed fares for whole-kilometer rides (not route fares)

RULE
Traditional: PHP 14 for first 4 km, +PHP 2.00 per succeeding km.
Modern: PHP 17 for first 4 km, +PHP 2.40 per succeeding km.
Student, senior, PWD: 20% off. Rounded to nearest PHP 0.25 for lookup examples.

STATUS
Published national rates, NOT verified route-specific Cagayan de Oro fare matrix.
Do not call the example lookup table official fare amounts.
For real routes compute each ride distance along directional geometry; charge per ride.
Verify applicable local rate, vehicle type, official distance/rounding, and concessions before production.

SOURCES
https://www.topgear.com.ph/news/industry-news/dotr-fare-hike-september-28-2026-a6941-20260928
https://www.untvnews.com/news/ltfrb-issues-new-fare-matrix-for-puvs-transport-group-to-launch-nationwide-transport-strike
https://www.foi.gov.ph/agencies/ltfrb/how-fare-matrix-is-made/
https://parkinganph.com/guides/fare-matrix
