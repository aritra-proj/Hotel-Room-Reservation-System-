// ============================================================
// bookingHelper.ts
// Core data structures and algorithms for the hotel reservation system.
//
// Hotel layout:
//   - Floors 1–9 : 10 rooms each  (rooms 101–110, 201–210, … 901–910)
//   - Floor 10   : 7 rooms        (rooms 1001–1007)
//   - Total      : 97 rooms
//
// Travel-time rules (from the problem statement):
//   - Same floor  : |col_a - col_b| minutes  (1 min per room)
//   - Diff floors : col_a + 2 × |floor_a - floor_b| + col_b minutes
//                   (walk to stairs at col 0, ride lift, walk to room)
// ============================================================

// ─── Types ───────────────────────────────────────────────────

/** A single hotel room with its physical location and booking status. */
export interface Room {
  id: string;        // Unique key – the room number as a string (e.g. "101")
  floor: number;     // Floor number, 1–10
  roomNo: number;    // Display number  (e.g. 101, 210, 1007)
  column: number;    // 0-indexed column from the left (lift side)
  isBooked: boolean; // Whether the room is currently occupied
}

/**
 * A completed reservation record stored in bookings.json.
 * One Booking entry is appended every time a guest successfully books rooms.
 */
export interface Booking {
  id: string;         // Short unique reference code (first 8 chars of a UUID-style id)
  rooms: number[];    // Sorted list of room numbers included in this booking
  travelTime: number; // Calculated first-to-last travel time in minutes
  timestamp: string;  // ISO-8601 date-time of when the booking was made
  floorRange: string; // Human-readable summary, e.g. "Floor 3" or "Floors 2–4"
  roomCount: number;  // Number of rooms reserved (1–5)
}

// ─── Room Initialisation ─────────────────────────────────────

/**
 * Builds the complete 97-room hotel structure from scratch.
 * Call this once on first load or after a full hotel reset.
 */
export function initializeRooms(): Room[] {
  const rooms: Room[] = [];

  // Floors 1–9: 10 rooms per floor, columns 0–9 (left = lift side)
  for (let floor = 1; floor <= 9; floor++) {
    for (let col = 0; col < 10; col++) {
      const roomNo = floor * 100 + (col + 1); // e.g. floor 3, col 2 → room 303
      rooms.push({ id: roomNo.toString(), floor, roomNo, column: col, isBooked: false });
    }
  }

  // Floor 10 (top floor): 7 rooms only, 1001–1007
  for (let col = 0; col < 7; col++) {
    const roomNo = 1000 + (col + 1);
    rooms.push({ id: roomNo.toString(), floor: 10, roomNo, column: col, isBooked: false });
  }

  return rooms;
}

// ─── Travel-Time Calculations ─────────────────────────────────

/**
 * Returns the travel time in minutes between two individual rooms.
 *
 * Same floor  → simple horizontal distance between columns.
 * Diff floors → walk to the lift shaft (col 0), ride to the target floor,
 *               then walk from the shaft to the destination room.
 *
 * Formula (diff floors): col_r1 + 2 × |floor_r1 - floor_r2| + col_r2
 */
export function calculateTravelTimeBetweenTwoRooms(r1: Room, r2: Room): number {
  if (r1.floor === r2.floor) {
    // Horizontal travel only – 1 minute per room apart
    return Math.abs(r1.column - r2.column);
  }

  // Vertical travel: reach the lift from r1, ride floors, walk to r2
  const verticalCost = 2 * Math.abs(r1.floor - r2.floor);
  const horizontalCost = r1.column + r2.column; // dist-to-lift + dist-from-lift
  return verticalCost + horizontalCost;
}

/**
 * Returns the total travel time for a set of booked rooms.
 * Defined as the time to walk from the physically "first" room
 * (lowest floor, then leftmost column) to the physically "last" room.
 */
export function calculateBookingTravelTime(selected: Room[]): number {
  if (selected.length <= 1) return 0;

  // Sort so index 0 = closest to ground-left, index N-1 = farthest
  const sorted = [...selected].sort((a, b) =>
    a.floor !== b.floor ? a.floor - b.floor : a.column - b.column
  );

  return calculateTravelTimeBetweenTwoRooms(sorted[0], sorted[sorted.length - 1]);
}

// ─── Optimal Room-Selection Algorithm ─────────────────────────

/**
 * Selects the best `count` rooms (1–5) from all currently available rooms.
 *
 * Priority 1 – Same-floor booking:
 *   For every floor that has ≥ count available rooms, slide a window of
 *   size `count` over the column-sorted rooms and measure horizontal
 *   distance (last_col – first_col).  Pick the window with the smallest
 *   distance.  Ties are broken by choosing lower floors and then
 *   leftmost starting columns.
 *
 * Priority 2 – Cross-floor booking (only if Priority 1 fails):
 *   All available rooms are sorted by (floor, column).  Every pair
 *   (sorted[i], sorted[j]) where j ≥ i + count − 1 is treated as a
 *   candidate (first room, last room) endpoint pair.  The pair that
 *   produces the lowest travelTimeBetween is selected; the N − 2
 *   middle rooms are chosen from those physically closest to the
 *   two endpoints.
 *
 * Returns null if fewer than `count` rooms are available at all.
 */
export function findOptimalRooms(
  rooms: Room[],
  count: number
): { selectedRooms: Room[]; travelTime: number } | null {
  // Guard: not enough rooms in the whole hotel
  const available = rooms.filter((r) => !r.isBooked);
  if (available.length < count) return null;
  if (count < 1 || count > 5) return null;

  // ── Priority 1: same-floor sliding-window search ──────────

  let bestSameFloorRooms: Room[] | null = null;
  let bestSameFloorTime = Infinity;

  for (let floor = 1; floor <= 10; floor++) {
    const floorRooms = available.filter((r) => r.floor === floor);
    if (floorRooms.length < count) continue; // not enough rooms on this floor

    // Sort by column so we can slide a window across adjacent rooms
    const sorted = [...floorRooms].sort((a, b) => a.column - b.column);

    for (let i = 0; i <= sorted.length - count; i++) {
      const window = sorted.slice(i, i + count);
      // Same-floor travel = column distance between first and last room in window
      const travelTime = window[count - 1].column - window[0].column;

      const isBetter =
        travelTime < bestSameFloorTime ||
        (travelTime === bestSameFloorTime &&
          (!bestSameFloorRooms ||
            floor < bestSameFloorRooms[0].floor ||
            (floor === bestSameFloorRooms[0].floor &&
              window[0].column < bestSameFloorRooms[0].column)));

      if (isBetter) {
        bestSameFloorTime = travelTime;
        bestSameFloorRooms = window;
      }
    }
  }

  // Return immediately if a valid single-floor booking was found
  if (bestSameFloorRooms) {
    return { selectedRooms: bestSameFloorRooms, travelTime: bestSameFloorTime };
  }

  // ── Priority 2: cross-floor exhaustive endpoint search ────

  // Sort all available rooms in physical order (bottom-left → top-right)
  const sortedAll = [...available].sort((a, b) =>
    a.floor !== b.floor ? a.floor - b.floor : a.column - b.column
  );

  let bestSpanRooms: Room[] | null = null;
  let bestSpanTime = Infinity;
  let bestSpanAnchor: Room | null = null;

  const M = sortedAll.length;

  for (let i = 0; i < M; i++) {
    for (let j = i + count - 1; j < M; j++) {
      // sortedAll[i] is our candidate "first" room, sortedAll[j] is "last"
      const first = sortedAll[i];
      const last = sortedAll[j];
      const travelTime = calculateTravelTimeBetweenTwoRooms(first, last);

      // Tie-break: prefer lower travel time → lower starting floor → leftmost column
      const isBetter =
        travelTime < bestSpanTime ||
        (travelTime === bestSpanTime &&
          (!bestSpanAnchor ||
            first.floor < bestSpanAnchor.floor ||
            (first.floor === bestSpanAnchor.floor &&
              first.column < bestSpanAnchor.column)));

      if (isBetter) {
        bestSpanTime = travelTime;
        bestSpanAnchor = first;

        // Pick the N − 2 middle rooms (between indices i+1 and j−1)
        // sorted by combined distance to both endpoints so they stay clustered
        const middlePool = sortedAll.slice(i + 1, j);
        const sortedMiddle = [...middlePool].sort((a, b) => {
          const distA =
            calculateTravelTimeBetweenTwoRooms(first, a) +
            calculateTravelTimeBetweenTwoRooms(a, last);
          const distB =
            calculateTravelTimeBetweenTwoRooms(first, b) +
            calculateTravelTimeBetweenTwoRooms(b, last);
          return distA - distB;
        });

        const chosen = [first, ...sortedMiddle.slice(0, count - 2), last];
        // Re-sort the final selection by physical position for display consistency
        bestSpanRooms = chosen.sort((a, b) =>
          a.floor !== b.floor ? a.floor - b.floor : a.column - b.column
        );
      }
    }
  }

  if (bestSpanRooms) {
    return { selectedRooms: bestSpanRooms, travelTime: bestSpanTime };
  }

  return null; // Should never reach here if available.length >= count
}

// ─── Booking Record Builder ────────────────────────────────────

/**
 * Creates a new Booking record to be appended to the history log.
 * Generates a short human-readable ID from the current timestamp.
 */
export function createBookingRecord(
  selectedRooms: Room[],
  travelTime: number
): Booking {
  // Build a short reference like "BK-1716123456-A3F"
  const timestamp = new Date().toISOString();
  const shortId = "BK-" + Date.now().toString(36).toUpperCase().slice(-6);

  // Determine which floors are involved for a human-readable summary
  const floors = [...new Set(selectedRooms.map((r) => r.floor))].sort((a, b) => a - b);
  const floorRange =
    floors.length === 1
      ? `Floor ${floors[0]}`
      : `Floors ${floors[0]}–${floors[floors.length - 1]}`;

  return {
    id: shortId,
    rooms: selectedRooms.map((r) => r.roomNo).sort((a, b) => a - b),
    travelTime,
    timestamp,
    floorRange,
    roomCount: selectedRooms.length,
  };
}
