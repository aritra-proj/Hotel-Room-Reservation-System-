# AuraStay – Hotel Room Reservation System

A full-stack Next.js application that optimally assigns hotel rooms to guests based on travel-time minimisation rules. Built as part of a recruitment assessment.

---

## Live Demo

> Deploy to [Vercel](https://vercel.com) or run locally (see **Getting Started** below).

---

## Problem Overview

The hotel has **97 rooms** across **10 floors**:

| Floor | Rooms | Room Numbers |
|-------|-------|--------------|
| 1–9   | 10 each | 101–110, 201–210, … 901–910 |
| 10 (top) | 7 | 1001–1007 |

The **staircase / lift is on the left** of every floor. Rooms are numbered left → right.

### Travel-time rules

| Movement | Cost |
|----------|------|
| One room horizontally (same floor) | 1 minute |
| One floor vertically (lift/stairs) | 2 minutes |
| Cross-floor trip | walk to lift + ride + walk from lift |

**Cross-floor formula:** `col_A + 2 × |floor_A − floor_B| + col_B` minutes  
(where `col` is the 0-based column index, i.e. the walking distance to the lift shaft)

### Booking rules

1. A single guest may book **1–5 rooms** per reservation.  
2. **Priority 1** – fill rooms on the **same floor** first, minimising horizontal travel.  
3. **Priority 2** – if no single floor has enough rooms, span floors while **minimising total travel time** (first-to-last room).

---

## Features

| Feature | Description |
|---------|-------------|
| Room booking | Select 1–5 rooms; algorithm picks the optimal set instantly |
| Travel-time display | Shows the calculated first-to-last travel time with formula |
| Hotel visualiser | 10-floor grid with colour-coded room states and hover tooltips |
| Lift indicator | Animated cabin moves to the average floor of the last booking |
| Random occupancy | Pre-fills ~35 % of rooms randomly to test the algorithm |
| Reset hotel | Wipes `data/bookings.json` and restores all 97 rooms to available |
| Booking history log | Every reservation is appended to the JSON file and shown newest-first |
| File persistence | All state survives server restarts via `data/bookings.json` |

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later  
- **npm** (comes with Node)

### Installation

```bash
# Clone or download the project
git clone <repo-url>
cd myself

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
npm run build
npm start
```

---

## Project Structure

```
myself/
├── src/
│   └── app/
│       ├── page.tsx                  # Main UI (client component)
│       ├── layout.tsx                # HTML shell, fonts, metadata
│       ├── globals.css               # Design-system CSS (no Tailwind classes in JSX)
│       ├── utils/
│       │   └── bookingHelper.ts      # Room types, travel-time calc, booking algorithm
│       └── api/
│           └── bookings/
│               └── route.ts          # GET / POST / DELETE handlers (server-side)
├── data/
│   └── bookings.json                 # Auto-created; persistent hotel state
├── DOCUMENTATION.md                  # Algorithm deep-dive & architecture notes
├── README.md                         # This file
├── package.json
├── next.config.ts
└── tsconfig.json
```

---

## How the Algorithm Works (summary)

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full explanation.

**Step 1 – Same-floor search**

For every floor that has ≥ N available rooms, sort the rooms by column and slide a window of size N. The window with the smallest `last_col − first_col` wins. Ties prefer lower floors then leftmost columns.

**Step 2 – Cross-floor search** (only if Step 1 finds nothing)

All available rooms are sorted by `(floor, column)`. Every valid `(first, last)` endpoint pair with at least N rooms between them is evaluated; the pair minimising `travelTimeBetween(first, last)` is selected. The N − 2 middle rooms are chosen by proximity to both endpoints.

---

## API Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/bookings` | — | Return full hotel state |
| `POST` | `/api/bookings` | `{ rooms, lastBooking, lastTravelTime, newBooking? }` | Persist state + optional new booking |
| `DELETE` | `/api/bookings` | — | Reset to factory defaults |

---

## Data File – `data/bookings.json`

```jsonc
{
  "rooms": [ /* 97 room objects */ ],
  "bookings": [
    {
      "id": "BK-1A2B3C",
      "rooms": [301, 302, 303],
      "travelTime": 2,
      "timestamp": "2025-05-21T10:30:00.000Z",
      "floorRange": "Floor 3",
      "roomCount": 3
    }
  ],
  "lastBooking": [ /* rooms from the most recent reservation */ ],
  "lastTravelTime": 2
}
```

Delete or clear this file at any time (or use the **Reset** button) to start fresh.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Vanilla CSS (custom design system) |
| Persistence | Node.js `fs` module → `data/bookings.json` |
| Fonts | Google Fonts (Outfit + Plus Jakarta Sans) |
| Deployment | Vercel (recommended) |

---

## License

MIT – free to use, modify, and distribute.
