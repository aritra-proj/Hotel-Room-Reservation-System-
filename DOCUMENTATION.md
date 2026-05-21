# AuraStay – Technical Documentation

## 1. Project Overview

AuraStay is a hotel room reservation system that automatically assigns the **optimal set of rooms** to a guest based on physical travel-time constraints. The core value proposition is the booking algorithm: given any occupancy pattern, it always returns the rooms that minimise the walking distance a guest must cover between their first and last assigned room.

---

## 2. Hotel Layout

```
Floor 10 │ [1001][1002][1003][1004][1005][1006][1007]  ·  ·  ·
Floor  9 │ [901][902][903][904][905][906][907][908][909][910]
Floor  8 │ [801][802][803][804][805][806][807][808][809][810]
  …      │   …
Floor  1 │ [101][102][103][104][105][106][107][108][109][110]
          ▲
       Lift / stairs (column 0, left side of building)
```

**Key facts:**

| Property | Value |
|----------|-------|
| Total floors | 10 |
| Rooms on floors 1–9 | 10 per floor |
| Rooms on floor 10 | 7 |
| Total rooms | 97 |
| Max rooms per booking | 5 |
| Column indexing | 0-based from lift side |

---

## 3. Travel-Time Model

### 3.1 Same-floor travel

When both rooms are on the same floor, the guest walks horizontally. No lift is needed.

```
time(R1, R2) = |col_R1 − col_R2|
```

Example: Room 103 (col 2) → Room 107 (col 6) = **4 minutes**

### 3.2 Cross-floor travel

When rooms are on different floors the guest must:

1. Walk from their current room to the lift shaft (column 0) — `col_current` minutes  
2. Ride the lift to the target floor — `2 × |floor_delta|` minutes  
3. Walk from the lift to the target room — `col_target` minutes

```
time(R1, R2) = col_R1 + 2 × |floor_R1 − floor_R2| + col_R2
```

Example: Room 205 (floor 2, col 4) → Room 307 (floor 3, col 6)

```
= 4 + 2×|2−3| + 6
= 4 + 2 + 6
= 12 minutes
```

### 3.3 Booking travel time

For a booking of N rooms, the total travel time is defined as:

> **Time from the physically "first" room (lowest floor, leftmost column) to the physically "last" room (highest floor, rightmost column)**

This is computed by:

1. Sorting the selected rooms by `(floor ASC, column ASC)`
2. Applying the travel-time formula between `sorted[0]` and `sorted[N-1]`

---

## 4. Booking Algorithm

Implemented in `src/app/utils/bookingHelper.ts → findOptimalRooms()`.

### 4.1 Priority 1 – Same-floor booking

**Goal:** Find N available rooms all on the same floor that minimise horizontal travel time.

**Method:**

```
for each floor 1..10:
    if available_rooms_on_floor >= N:
        sort available rooms by column
        slide a window of size N across the sorted list
        candidate_time = window[N-1].column − window[0].column
        track minimum candidate_time and corresponding rooms

if any floor produced a valid window → return that result immediately
```

**Tie-breaking:**
- Smaller travel time wins.
- Tie → prefer lower floor.
- Still tied → prefer leftmost starting column (closer to the lift).

**Complexity:** O(F × R_f) where F = floors (10) and R_f = available rooms per floor (≤ 10). Effectively O(100) — negligible.

### 4.2 Priority 2 – Cross-floor booking

Only reached if no single floor has ≥ N available rooms.

**Goal:** Select N rooms from anywhere in the hotel that minimise the first-to-last travel time.

**Method:**

```
sort all available rooms by (floor ASC, column ASC)
M = number of available rooms

for i in 0..M-1:          // candidate "first" room
    for j in i+N-1..M-1:  // candidate "last" room
        time = travelTimeBetween(sorted[i], sorted[j])
        if time < best_time:
            best_time = time
            middle_pool = rooms between index i+1 and j-1
            sort middle_pool by (dist_to_first + dist_to_last)
            chosen_middle = middle_pool[0..N-3]
            best_rooms = [sorted[i], ...chosen_middle, sorted[j]]
```

**Why enumerate all (i, j) pairs?**

Travel time is non-monotone as j increases beyond i+N-1. A room far from i in sorted order might be on a lower floor and actually closer physically. The O(M²) enumeration (M ≤ 97, so ≤ 9,409 pairs) is fast enough to be imperceptible to the user.

**Middle room selection:**

The N−2 middle rooms do not affect the first-to-last travel time (only the endpoints matter). They are chosen by minimising their combined distance to both endpoints, keeping the booking spatially clustered and practical for the guest.

**Complexity:** O(M²) ≤ O(97²) ≈ 9,400 iterations — still negligible.

---

## 5. Data Persistence

### 5.1 File location

```
<project-root>/data/bookings.json
```

The file is auto-created on first request if it does not exist.

### 5.2 Schema

```typescript
interface HotelState {
  rooms:         Room[];    // 97-element snapshot of current occupancy
  bookings:      Booking[]; // Append-only reservation history log
  lastBooking:   Room[];    // Rooms from the most-recent booking (for UI highlight)
  lastTravelTime: number;   // Travel time of the most-recent booking
}

interface Room {
  id:       string;  // Room number as string key (e.g. "101")
  floor:    number;  // 1–10
  roomNo:   number;  // Display number (e.g. 101, 1007)
  column:   number;  // 0-based horizontal index from the lift
  isBooked: boolean;
}

interface Booking {
  id:         string;   // Short reference like "BK-1A2B3C"
  rooms:      number[]; // Sorted room numbers
  travelTime: number;   // Minutes from first to last room
  timestamp:  string;   // ISO-8601
  floorRange: string;   // e.g. "Floor 3" or "Floors 2–4"
  roomCount:  number;   // 1–5
}
```

### 5.3 API operations

| Operation | HTTP | File effect |
|-----------|------|-------------|
| Load state | GET `/api/bookings` | Reads file (creates if missing) |
| Book rooms | POST `/api/bookings` | Overwrites file with updated rooms + appended booking |
| Random fill | POST `/api/bookings` | Overwrites rooms; preserves existing booking history |
| Reset all | DELETE `/api/bookings` | Overwrites with factory defaults (all rooms free, history empty) |

---

## 6. Component Architecture

```
page.tsx  (Client Component – "use client")
│
├── State
│   ├── rooms[]           – live 97-room array
│   ├── lastBooking[]     – rooms in most-recent reservation
│   ├── lastTravelTime    – travel time of most-recent reservation
│   ├── bookingHistory[]  – full Booking[] log from JSON file
│   ├── numRequested      – slider value (1–5)
│   └── isLoading / error – async UX flags
│
├── Effects
│   └── useEffect (mount) → GET /api/bookings → hydrate all state
│
├── Handlers
│   ├── handleBookRooms()       → findOptimalRooms() → POST /api/bookings
│   ├── handleRandomOccupancy() → randomise rooms → POST /api/bookings
│   └── handleResetHotel()      → DELETE /api/bookings
│
└── Render
    ├── <header>                – sticky brand bar
    ├── <section> (sidebar)
    │   ├── Booking controls    – slider + 3 buttons
    │   ├── Occupancy stats     – 4 counters
    │   ├── Active booking      – last booking rooms + travel time + formula
    │   └── Booking history     – scrollable log, newest-first
    └── <section> (visualiser)
        ├── Floor-plan grid     – 10 floor rows × up to 10 room nodes
        ├── Lift cabin          – animated indicator at average booking floor
        └── Travel explainer    – static formula reference bar
```

---

## 7. Design Decisions

### Why client-side algorithm + server-side persistence?

The booking algorithm runs entirely in the browser (`bookingHelper.ts` is a pure TS module imported into the client component). This keeps the booking UX instant — no round-trip latency. The server is only used for file I/O, which is what the assessment requires.

### Why a flat JSON file instead of a database?

The spec says "store details into a local file". A flat JSON file kept in `data/bookings.json` satisfies this literally, requires zero infrastructure, and is easy to inspect and share.

### Why vanilla CSS instead of Tailwind?

The project uses Tailwind v4 (which has significant API changes from v3). To avoid configuration complexity, the entire design system is written as plain CSS custom properties in `globals.css`. This also keeps the JSX markup clean and readable.

### Why not use UUIDs for booking IDs?

Short IDs like `BK-1A2B3C` (derived from `Date.now().toString(36)`) are human-readable in the UI and sufficient for a demo-scale system with no concurrent users. Full UUIDs add library weight without benefit here.

---

## 8. Running Locally

```bash
npm install     # install Next.js and dependencies
npm run dev     # start dev server at http://localhost:3000
npm run build   # production build
npm start       # serve production build
```

The `data/` directory is created automatically on first run. To reset everything, either press **Reset & Clear File** in the UI or delete `data/bookings.json` manually.

---

## 9. Deployment Notes

When deploying to **Vercel** or any serverless platform, the `fs`-based file approach will not work because the file system is ephemeral (new function instance = no previous `bookings.json`). For production deployment:

- Replace `data/bookings.json` with a hosted database (e.g. Vercel KV, Upstash Redis, PlanetScale).
- The API route interface (`GET / POST / DELETE /api/bookings`) stays the same; only the storage layer changes.

For a local demo / assessment submission, the file-based approach is correct and fully functional.
