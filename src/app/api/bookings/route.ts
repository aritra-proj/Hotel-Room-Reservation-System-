// ============================================================
// api/bookings/route.ts
// Next.js App Router API handlers for hotel booking persistence.
//
// All reservation state is stored in  /data/bookings.json
// (a plain JSON file on the server file system).
//
// GET    /api/bookings  → return current hotel state
// POST   /api/bookings  → persist a new booking (rooms + history entry)
// DELETE /api/bookings  → wipe the file and restore factory defaults
// ============================================================

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { initializeRooms, Room, Booking } from "../../utils/bookingHelper";

// ─── File-system constants ────────────────────────────────────

// Resolve the data directory relative to the project root (process.cwd())
const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "bookings.json");

// ─── State shape ─────────────────────────────────────────────

/**
 * The complete hotel state persisted to disk.
 *   rooms        – current occupancy snapshot of all 97 rooms
 *   bookings     – append-only log of every completed reservation
 *   lastBooking  – rooms from the most-recent booking (used for highlighting)
 *   lastTravelTime – travel time of the most-recent booking
 */
interface HotelState {
  rooms: Room[];
  bookings: Booking[];
  lastBooking: Room[];
  lastTravelTime: number;
}

// ─── File helpers ─────────────────────────────────────────────

/**
 * Reads bookings.json from disk.
 * If the file (or its parent directory) does not yet exist, initialises
 * a clean state, writes it to disk, and returns it.
 */
async function getOrCreateState(): Promise<HotelState> {
  // Always ensure the data directory exists before any file operation
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const content = await fs.readFile(FILE_PATH, "utf-8");
    const parsed = JSON.parse(content) as HotelState;

    // Migrate older saved states that pre-date the `bookings` array field
    if (!Array.isArray(parsed.bookings)) {
      parsed.bookings = [];
    }

    return parsed;
  } catch {
    // File doesn't exist yet – write and return the initial state
    const defaultState: HotelState = {
      rooms: initializeRooms(),
      bookings: [],
      lastBooking: [],
      lastTravelTime: 0,
    };
    await fs.writeFile(FILE_PATH, JSON.stringify(defaultState, null, 2), "utf-8");
    return defaultState;
  }
}

/**
 * Writes the given state object to bookings.json with pretty-printing.
 */
async function persistState(state: HotelState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Route handlers ───────────────────────────────────────────

/**
 * GET /api/bookings
 * Returns the full hotel state (rooms + booking history).
 */
export async function GET() {
  try {
    const state = await getOrCreateState();
    return NextResponse.json(state);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load hotel state: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookings
 * Persists an updated room list and optionally appends a new booking record.
 *
 * Expected body:
 * {
 *   rooms         : Room[]    – full 97-room array with updated isBooked flags
 *   lastBooking   : Room[]    – rooms in the most-recent reservation (for UI highlight)
 *   lastTravelTime: number    – travel time of the most-recent booking
 *   newBooking?   : Booking   – (optional) booking record to append to history
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rooms, lastBooking, lastTravelTime, newBooking } = body;

    // Validate the rooms payload
    if (!rooms || !Array.isArray(rooms)) {
      return NextResponse.json(
        { error: "Invalid payload: 'rooms' must be an array." },
        { status: 400 }
      );
    }

    // Load existing state so we can safely append to the booking history
    const current = await getOrCreateState();

    // If a booking record was provided, append it to the history log
    const updatedBookings: Booking[] = newBooking
      ? [...current.bookings, newBooking as Booking]
      : current.bookings;

    const updatedState: HotelState = {
      rooms: rooms as Room[],
      bookings: updatedBookings,
      lastBooking: (lastBooking as Room[]) || [],
      lastTravelTime: (lastTravelTime as number) || 0,
    };

    await persistState(updatedState);
    return NextResponse.json({ success: true, state: updatedState });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to persist hotel state: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings
 * Clears the entire bookings.json file by overwriting it with a fresh
 * default state – all rooms available, booking history empty.
 */
export async function DELETE() {
  try {
    const freshState: HotelState = {
      rooms: initializeRooms(),
      bookings: [],
      lastBooking: [],
      lastTravelTime: 0,
    };

    await persistState(freshState);
    return NextResponse.json({ success: true, state: freshState });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to reset hotel file: ${message}` },
      { status: 500 }
    );
  }
}
