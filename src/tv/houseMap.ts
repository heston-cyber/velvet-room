// The house, top down, drawn from Heston's walk-through video (Oct 14). The front door is at the
// bottom. Facing in from the front door: the bedroom wing (office, guest room, hall bath) is on the
// left; the kitchen and dining are on the right with the main bedroom past them; the garage is on
// the right. It's a sketch, not a survey: fix a room here by changing its box.
//
// Game rooms are tied to the game's room keys (Game menu > Rooms). A game room whose key isn't
// here simply isn't drawn; everything in `other` is scenery (off limits, never holds markers).

export type Box = { x: number; y: number; w: number; h: number };
export type MapRoom = Box & { key: string; divider?: { x1: number; y1: number; x2: number; y2: number }; note?: string };
export type MapArea = Box & { name: string; kind: "off" | "hall" };

export const HOUSE = {
  w: 1000,
  h: 640,
  rooms: [
    { key: "private", x: 40, y: 40, w: 230, h: 210, note: "Guest room" },
    { key: "office", x: 40, y: 370, w: 230, h: 230, note: "Office" },
    { key: "lounge", x: 330, y: 40, w: 310, h: 290, note: "Living room" },
    { key: "conservatory", x: 470, y: 410, w: 170, h: 190, note: "Plant room" },
    { key: "bar", x: 640, y: 40, w: 170, h: 380, note: "Kitchen & dining", divider: { x1: 640, y1: 170, x2: 810, y2: 170 } },
  ] as MapRoom[],
  other: [
    { name: "Bath", kind: "off", x: 40, y: 250, w: 230, h: 120 },
    { name: "", kind: "hall", x: 270, y: 110, w: 60, h: 490 },
    { name: "", kind: "hall", x: 330, y: 330, w: 310, h: 80 },
    { name: "Entry", kind: "hall", x: 330, y: 410, w: 140, h: 190 },
    { name: "Private", kind: "off", x: 810, y: 40, w: 150, h: 290 },
    { name: "Laundry", kind: "off", x: 810, y: 330, w: 150, h: 90 },
    { name: "Garage", kind: "off", x: 640, y: 420, w: 320, h: 180 },
  ] as MapArea[],
  frontDoor: { x: 400, y: 600 },
};

/** Where the numbered pins sit inside a room: a centred grid below the room's name. */
export function pinSpots(room: Box, count: number): { x: number; y: number }[] {
  if (!count) return [];
  const size = 46;
  const cols = Math.max(1, Math.min(count, Math.floor((room.w - 20) / (size + 10))));
  const rows = Math.ceil(count / cols);
  const top = room.y + 78;
  const usable = room.y + room.h - top - 14;
  const step = Math.min(size + 10, rows > 1 ? usable / rows : size + 10);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const c = i % cols;
    const rowW = inRow * (size + 10) - 10;
    out.push({ x: room.x + (room.w - rowW) / 2 + c * (size + 10) + size / 2, y: top + r * step + size / 2 });
  }
  return out;
}
