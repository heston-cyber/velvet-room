// The house map on the TV while guests search. Open rooms glow; sealed rooms are hatched with the
// round they open in. Every marker is a numbered pin in its room: hollow until someone scans it,
// then stamped gold. The body room gets a chalk outline.
import { HOUSE, layoutFor, pinSpots } from "./houseMap";

export type MapData = {
  rooms: { key: string; label: string; opensIn: number; note?: string }[];
  markers: { number: number; room: string; foundAt: number | null }[];
};

const FRESH_MS = 6000;

export default function HouseMap({ map, round, bodyRoomKey, now, compact }: { map: MapData; round: number; bodyRoomKey?: string | null; now: number; compact?: boolean }) {
  const byKey = new Map(map.rooms.map((r) => [r.key, r]));
  const found = map.markers.filter((m) => m.foundAt !== null && m.foundAt <= now).length;
  const plan = layoutFor(map.rooms);
  return (
    <figure className={`tv-map ${compact ? "compact" : ""}`} aria-label="Map of the house">
      <svg viewBox={`0 0 ${HOUSE.w} ${HOUSE.h + 40}`} role="img">
        <defs>
          <pattern id="seal" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(214,178,94,.22)" strokeWidth="5" />
          </pattern>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Scenery: halls and the rooms that are out of play */}
        {plan.other.map((a, i) => (
          <g key={`o${i}`} className={`area ${a.kind}`}>
            <rect x={a.x} y={a.y} width={a.w} height={a.h} />
            {a.name && (
              <text x={a.x + a.w / 2} y={a.y + a.h / 2 + 6} textAnchor="middle">
                {a.name}
              </text>
            )}
          </g>
        ))}
        {/* The game rooms */}
        {plan.rooms.map((r) => {
          const room = byKey.get(r.key);
          if (!room) return null;
          const sealed = room.opensIn > Math.max(1, round);
          const pins = map.markers.filter((m) => m.room === r.key);
          const spots = pinSpots(r, pins.length);
          return (
            <g key={r.key} className={`room ${sealed ? "sealed" : "open"}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} className="floor" />
              {sealed && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="url(#seal)" />}
              {r.divider && <line {...r.divider} className="divider" />}
              <text x={r.x + r.w / 2} y={r.y + 38} textAnchor="middle" className="name" style={{ fontSize: fit(room.label.replace(/^The /, ""), r.w, 32, 0.62) }}>
                {room.label.replace(/^The /, "")}
              </text>
              <text x={r.x + r.w / 2} y={r.y + 60} textAnchor="middle" className="note" style={{ fontSize: fit(sealed ? `Opens Round ${room.opensIn}` : r.note ?? "", r.w, 15, 0.8) }}>
                {sealed ? `Opens Round ${room.opensIn}` : r.note ?? ""}
              </text>
              {r.key === bodyRoomKey && <Chalk x={r.x + r.w - 46} y={r.y + r.h - 34} />}
              {pins.map((m, i) => {
                const s = spots[i];
                const isFound = m.foundAt !== null && m.foundAt <= now;
                const fresh = isFound && now - m.foundAt! < FRESH_MS;
                return (
                  <g key={m.number} transform={`translate(${s.x} ${s.y})`}>
                    <g className={`pin ${isFound ? "found" : ""} ${fresh ? "fresh" : ""}`}>
                      <circle r="21" />
                      <text y="8" textAnchor="middle">
                        {m.number}
                      </text>
                      {isFound && <path className="tick" d="M -9 1 L -2 8 L 11 -8" />}
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* The front door */}
        {plan.frontDoor && (
          <g className="door" transform={`translate(${plan.frontDoor.x} ${plan.frontDoor.y})`}>
            <rect x="-30" y="-4" width="60" height="8" />
            <text y="34" textAnchor="middle">
              Front door
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        <b>{found}</b> of {map.markers.length} cards found
      </figcaption>
    </figure>
  );
}

/** A font size that keeps a label inside its room (roughly: average glyph width as a share of the size). */
function fit(text: string, width: number, max: number, glyph: number) {
  return Math.max(9, Math.min(max, (width - 18) / Math.max(1, text.length * glyph)));
}

/** Where the body was found: a little chalk outline. */
function Chalk({ x, y }: { x: number; y: number }) {
  return (
    <g className="chalk" transform={`translate(${x} ${y}) rotate(-18)`}>
      <circle cx="0" cy="-22" r="7" />
      <path d="M 0 -15 L 0 6 M -12 -8 L 12 -4 M 0 6 L -9 22 M 0 6 L 10 21" />
    </g>
  );
}
