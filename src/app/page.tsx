"use client";

// ============================================================
// page.tsx  –  AuraStay Hotel Reservation System
//
// Room highlight states (4 levels, checked in priority order):
//   1. selected  – gold pulsing  – rooms from the last CONFIRMED booking
//   2. preview   – indigo glow   – rooms the algorithm WOULD pick right now
//                                  (updates live as you move the slider)
//   3. occupied  – red           – any other booked room
//   4. (default) – green         – available
//
// The preview state is what makes the slider feel responsive:
// a useEffect re-runs findOptimalRooms on every numRequested/rooms
// change so the floor-plan always shows the candidate rooms instantly.
// ============================================================

import { useState, useEffect } from "react";
import {
  Room,
  Booking,
  initializeRooms,
  findOptimalRooms,
  createBookingRecord,
} from "./utils/bookingHelper";

export default function Home() {
  // ── State ────────────────────────────────────────────────

  // Full 97-room snapshot; each carries its live isBooked flag
  const [rooms, setRooms] = useState<Room[]>([]);

  // Rooms confirmed in the most-recent booking → gold highlight
  const [lastBooking, setLastBooking] = useState<Room[]>([]);
  const [lastTravelTime, setLastTravelTime] = useState<number>(0);

  // Rooms the algorithm WOULD select right now → indigo preview highlight
  // Updated instantly whenever the slider or room availability changes
  const [previewRooms, setPreviewRooms] = useState<Room[]>([]);
  const [previewTravelTime, setPreviewTravelTime] = useState<number>(0);

  // Full append-only booking history stored in data/bookings.json
  const [bookingHistory, setBookingHistory] = useState<Booking[]>([]);

  // Slider value: how many rooms the guest wants to book (1–5)
  const [numRequested, setNumRequested] = useState<number>(1);

  // Async lock – prevents double-clicks while a fetch is in progress
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Inline error shown below the action buttons
  const [error, setError] = useState<string | null>(null);

  // ── Hydrate from persisted file on first mount ────────────

  useEffect(() => {
    async function loadHotelState() {
      try {
        const res = await fetch("/api/bookings");
        if (res.ok) {
          const data = await res.json();
          setRooms(data.rooms || initializeRooms());
          setLastBooking(data.lastBooking || []);
          setLastTravelTime(data.lastTravelTime || 0);
          setBookingHistory(data.bookings || []);
        } else {
          setRooms(initializeRooms());
        }
      } catch (err) {
        console.error("Failed to load hotel state:", err);
        setRooms(initializeRooms());
      } finally {
        setIsLoading(false);
      }
    }
    loadHotelState();
  }, []);

  // ── Live preview: re-run algorithm on every slider / room change ──
  //
  // This is the core fix for the highlight not updating:
  // Whenever numRequested OR the rooms array changes (after a booking,
  // random fill, or reset), we immediately compute which rooms the
  // algorithm would pick and store them in previewRooms.
  // The visualization reads previewRooms to draw the indigo highlight.
  // No network call needed – the algorithm is pure client-side.

  useEffect(() => {
    // Don't run until rooms are loaded
    if (rooms.length === 0) return;

    const result = findOptimalRooms(rooms, numRequested);
    if (result) {
      setPreviewRooms(result.selectedRooms);
      setPreviewTravelTime(result.travelTime);
    } else {
      // Not enough rooms available for this count
      setPreviewRooms([]);
      setPreviewTravelTime(0);
    }
  }, [numRequested, rooms]); // re-runs on slider change OR after any booking action

  // ── Action handlers ──────────────────────────────────────

  /**
   * BOOK ROOMS
   * Confirms the current preview selection:
   * 1. Re-runs algorithm (in case state changed between preview & click)
   * 2. Marks rooms as booked
   * 3. Persists to data/bookings.json via POST /api/bookings
   * 4. Updates all React state from the server response
   */
  const handleBookRooms = async () => {
    setError(null);
    if (numRequested < 1 || numRequested > 5) {
      setError("Please select between 1 and 5 rooms.");
      return;
    }
    setIsLoading(true);

    // Run the algorithm against the authoritative rooms state
    const result = findOptimalRooms(rooms, numRequested);
    if (!result) {
      setError("Not enough available rooms to fulfil this booking.");
      setIsLoading(false);
      return;
    }

    const { selectedRooms, travelTime } = result;

    // Mark each selected room as booked in a new rooms array
    const selectedIds = new Set(selectedRooms.map((r) => r.id));
    const updatedRooms = rooms.map((room) =>
      selectedIds.has(room.id) ? { ...room, isBooked: true } : room
    );

    // Build the booking record to be appended to the history log
    const newBooking = createBookingRecord(selectedRooms, travelTime);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: updatedRooms,
          lastBooking: selectedRooms,
          lastTravelTime: travelTime,
          newBooking,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Updating rooms triggers the preview useEffect automatically,
        // so previewRooms will recalculate to the NEXT best available set
        setRooms(data.state.rooms);
        setLastBooking(data.state.lastBooking);
        setLastTravelTime(data.state.lastTravelTime);
        setBookingHistory(data.state.bookings);
      } else {
        setError("Server error: could not save the booking.");
      }
    } catch (err) {
      console.error("Network error during booking:", err);
      setError("Network error – please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * RANDOM OCCUPANCY
   * Pre-fills ~35% of rooms randomly and clears history.
   * The preview useEffect fires after setRooms() to show the best
   * available rooms under the new random occupancy immediately.
   */
  const handleRandomOccupancy = async () => {
    setError(null);
    setIsLoading(true);

    const randomized = initializeRooms().map((room) => ({
      ...room,
      isBooked: Math.random() < 0.35,
    }));

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: randomized, lastBooking: [], lastTravelTime: 0 }),
      });

      if (res.ok) {
        const data = await res.json();
        setLastBooking([]);
        setLastTravelTime(0);
        setBookingHistory(data.state.bookings);
        // Setting rooms last so the preview effect fires with the freshest data
        setRooms(data.state.rooms);
      } else {
        setError("Failed to save randomised occupancy.");
      }
    } catch (err) {
      console.error("Network error during random occupancy:", err);
      setError("Network error – please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * RESET HOTEL
   * Wipes data/bookings.json back to factory defaults (all 97 rooms free).
   * Preview will immediately reflect all rooms available again.
   */
  const handleResetHotel = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/bookings", { method: "DELETE" });

      if (res.ok) {
        const data = await res.json();
        setLastBooking([]);
        setLastTravelTime(0);
        setBookingHistory([]);
        setRooms(data.state.rooms); // triggers preview useEffect
      } else {
        setError("Failed to reset the hotel file.");
      }
    } catch (err) {
      console.error("Network error during reset:", err);
      setError("Network error – please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────

  const totalRoomsCount      = rooms.length;
  const bookedRoomsCount     = rooms.filter((r) => r.isBooked).length;
  const availableRoomsCount  = totalRoomsCount - bookedRoomsCount;
  const occupancyPercentage  =
    totalRoomsCount > 0 ? Math.round((bookedRoomsCount / totalRoomsCount) * 100) : 0;

  // Build fast-lookup Sets so each room node can resolve its state in O(1)
  const lastBookingIds  = new Set(lastBooking.map((r) => r.id));
  const previewIds      = new Set(previewRooms.map((r) => r.id));

  // Lift cabin sits at the average floor of the preview (or last booking as fallback)
  const liftTargetRooms = previewRooms.length > 0 ? previewRooms : lastBooking;
  const currentLiftFloor =
    liftTargetRooms.length > 0
      ? Math.round(liftTargetRooms.reduce((s, r) => s + r.floor, 0) / liftTargetRooms.length)
      : 1;

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="header-wrapper">
        <div className="header-logo">
          <h1>AURASTAY</h1>
          <span>Reservation Engine</span>
        </div>
        <div className="header-meta">
          <span>10 Floors</span>
          <span>97 Suites</span>
          <span>Live File Sync</span>
        </div>
      </header>

      <main className="dashboard-container">

        {/* ════════════════════════════════ LEFT SIDEBAR ═════ */}
        <section className="control-sidebar">

          {/* ── Booking controls ───────────────────────────── */}
          <div className="glass-panel">
            <h2 className="control-label">Create Reservation</h2>

            <div className="control-group">
              <label className="control-label" style={{ fontSize: "0.75rem", marginBottom: "6px" }}>
                Rooms to Book (1–5)
              </label>
              <div className="slider-container">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={numRequested}
                  // Updating numRequested triggers the preview useEffect →
                  // indigo rooms in the floor-plan update instantly
                  onChange={(e) => setNumRequested(parseInt(e.target.value))}
                  className="custom-range"
                  aria-label="Number of rooms to book"
                />
                <div className="range-badge">{numRequested}</div>
              </div>
            </div>

            {/* Live preview summary shown while slider is being adjusted */}
            {previewRooms.length > 0 && (
              <div className="preview-hint">
                <span className="preview-dot"></span>
                Preview: rooms{" "}
                <strong>{previewRooms.map((r) => r.roomNo).join(", ")}</strong>
                {" · "}travel {previewTravelTime} min
              </div>
            )}
            {previewRooms.length === 0 && rooms.length > 0 && (
              <div className="preview-hint preview-hint--warn">
                No available rooms for {numRequested} booking{numRequested > 1 ? "s" : ""}
              </div>
            )}

            <button
              onClick={handleBookRooms}
              className="btn btn-primary"
              style={{ marginBottom: "16px", marginTop: "12px" }}
              disabled={isLoading || previewRooms.length === 0}
              aria-label="Confirm booking of previewed rooms"
            >
              Confirm Booking
            </button>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={handleRandomOccupancy}
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "10px 12px" }}
                disabled={isLoading}
                title="Pre-fill ~35% of rooms randomly"
              >
                Random Occupancy
              </button>
              <button
                onClick={handleResetHotel}
                className="btn btn-danger"
                style={{ fontSize: "0.75rem", padding: "10px 12px" }}
                disabled={isLoading}
                title="Wipe bookings.json and restore all rooms"
              >
                Reset &amp; Clear File
              </button>
            </div>

            {error && <div className="error-banner" role="alert">{error}</div>}
          </div>

          {/* ── Occupancy stats ────────────────────────────── */}
          <div className="glass-panel">
            <h2 className="control-label">Hotel Occupancy</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-num cyan">{availableRoomsCount}</div>
                <div className="stat-label">Available</div>
              </div>
              <div className="stat-item">
                <div className="stat-num rose">{bookedRoomsCount}</div>
                <div className="stat-label">Booked</div>
              </div>
              <div className="stat-item">
                <div className="stat-num emerald">{totalRoomsCount}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-item">
                <div className="stat-num gold">{occupancyPercentage}%</div>
                <div className="stat-label">Occupancy</div>
              </div>
            </div>
          </div>

          {/* ── Last confirmed booking ─────────────────────── */}
          <div className="glass-panel results-card">
            <h2 className="control-label" style={{ color: "var(--accent-gold)" }}>
              Last Confirmed Booking
            </h2>
            {lastBooking.length > 0 ? (
              <div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                  Gold rooms on the floor-plan:
                </p>
                <div className="result-rooms-flex">
                  {lastBooking.map((room) => (
                    <span key={room.id} className="result-room-tag">{room.roomNo}</span>
                  ))}
                </div>
                <div className="result-metric">
                  <span style={{ color: "var(--text-muted)" }}>Rooms booked:</span>
                  <span style={{ fontWeight: 600 }}>{lastBooking.length}</span>
                </div>
                <div className="result-metric">
                  <span style={{ color: "var(--text-muted)" }}>Floors:</span>
                  <span style={{ fontWeight: 600 }}>
                    {(() => {
                      const sorted = [...lastBooking].sort((a, b) => a.floor - b.floor);
                      return sorted[0].floor === sorted[sorted.length - 1].floor
                        ? `Floor ${sorted[0].floor}`
                        : `Floors ${sorted[0].floor}–${sorted[sorted.length - 1].floor}`;
                    })()}
                  </span>
                </div>
                <div className="result-metric" style={{ borderBottom: "none" }}>
                  <span style={{ color: "var(--text-muted)" }}>Travel time:</span>
                  <span className="result-time">{lastTravelTime} min</span>
                </div>
                {lastBooking.length >= 2 && (() => {
                  const sorted = [...lastBooking].sort((a, b) =>
                    a.floor !== b.floor ? a.floor - b.floor : a.column - b.column
                  );
                  const f = sorted[0], l = sorted[sorted.length - 1];
                  return (
                    <p className="travel-formula">
                      {f.floor === l.floor
                        ? `Same floor: |col ${f.column} – col ${l.column}| = ${lastTravelTime} min`
                        : `Col ${f.column} + ${Math.abs(f.floor - l.floor)}×2 + col ${l.column} = ${lastTravelTime} min`}
                    </p>
                  );
                })()}
              </div>
            ) : (
              <p className="result-empty">No confirmed booking yet.</p>
            )}
          </div>

          {/* ── Booking history log ────────────────────────── */}
          <div className="glass-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 className="control-label" style={{ margin: 0 }}>Booking History</h2>
              <span className="history-count">{bookingHistory.length} total</span>
            </div>
            {bookingHistory.length === 0 ? (
              <p className="result-empty">No bookings recorded yet.</p>
            ) : (
              <div className="history-list">
                {[...bookingHistory].reverse().map((booking) => (
                  <div key={booking.id} className="history-item">
                    <div className="history-header">
                      <span className="history-id">{booking.id}</span>
                      <span className="history-time">
                        {new Date(booking.timestamp).toLocaleString(undefined, {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="history-rooms">
                      {booking.rooms.map((rNo) => (
                        <span key={rNo} className="history-room-tag">{rNo}</span>
                      ))}
                    </div>
                    <div className="history-meta">
                      <span>{booking.floorRange}</span>
                      <span className="history-travel">{booking.travelTime} min travel</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════ FLOOR-PLAN PANEL ══ */}
        <section className="glass-panel hotel-visualizer" style={{ position: "relative" }}>

          {isLoading && (
            <div className="loading-overlay" aria-live="polite">
              <div className="spinner" role="status"></div>
              <div className="loading-text">Syncing with local file…</div>
            </div>
          )}

          {/* Header + legend */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="control-label" style={{ margin: 0 }}>Hotel Floor Plan</h2>
            <div className="visualizer-legend">
              <div className="legend-item">
                <span className="legend-dot available"></span>Available
              </div>
              <div className="legend-item">
                <span className="legend-dot preview"></span>Preview
              </div>
              <div className="legend-item">
                <span className="legend-dot selected"></span>Booked
              </div>
              <div className="legend-item">
                <span className="legend-dot occupied"></span>Occupied
              </div>
            </div>
          </div>

          {/* Hotel grid – floors rendered top (10) → bottom (1) */}
          <div className="hotel-facade">
            {Array.from({ length: 10 }, (_, idx) => 10 - idx).map((floorNum) => {
              const floorRooms  = rooms.filter((r) => r.floor === floorNum);
              const isTopFloor  = floorNum === 10;

              return (
                <div key={floorNum} className="floor-row">
                  <div className="floor-label">F{floorNum}</div>

                  {/* Animated lift cabin */}
                  <div className="lift-shaft-cell">
                    <div className="lift-rail"></div>
                    {currentLiftFloor === floorNum && (
                      <div className="lift-cabin" title={`Lift at Floor ${floorNum}`}></div>
                    )}
                  </div>

                  {/* Room nodes */}
                  <div className={`rooms-row-grid ${isTopFloor ? "top-floor" : ""}`}>
                    {floorRooms.map((room) => {
                      // Resolve the room's display state using pre-built Sets (O(1) each)
                      const isConfirmed = lastBookingIds.has(room.id);  // gold – last booking
                      const isPreview   = previewIds.has(room.id);      // indigo – next booking preview

                      // Priority: confirmed > preview > occupied > available
                      let roomClass = "";
                      if (isConfirmed)       roomClass = "selected";  // gold pulsing
                      else if (isPreview)    roomClass = "preview";   // indigo glow
                      else if (room.isBooked) roomClass = "occupied"; // red

                      const statusLabel = isConfirmed
                        ? "Just Booked"
                        : isPreview
                          ? "Preview"
                          : room.isBooked
                            ? "Occupied"
                            : "Available";

                      return (
                        <div
                          key={room.id}
                          className={`room-node ${roomClass}`}
                          role="button"
                          aria-label={`Room ${room.roomNo}, ${statusLabel}`}
                        >
                          <span className="room-no">{room.roomNo}</span>
                          <span className="room-col-idx">C{room.column}</span>

                          <div className="tooltip" aria-hidden="true">
                            <strong>Room {room.roomNo}</strong><br />
                            Status: {statusLabel}<br />
                            Floor {room.floor} · Column {room.column}<br />
                            Walk to lift: {room.column} min
                          </div>
                        </div>
                      );
                    })}

                    {/* Spacer placeholders for the 3 missing rooms on floor 10 */}
                    {isTopFloor &&
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={`ph-${i}`} className="room-empty-placeholder" aria-hidden="true" />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Travel-time formula reference */}
          <div className="travel-explainer">
            <span>Horizontal: 1 min/room</span>
            <span className="explainer-divider">·</span>
            <span>Vertical: 2 min/floor</span>
            <span className="explainer-divider">·</span>
            <span>Cross-floor: col_A + 2×floors + col_B</span>
          </div>
        </section>
      </main>
    </>
  );
}
