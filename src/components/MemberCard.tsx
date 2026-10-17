import { faceUrl } from "../lib/figure";

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "")[0])
    .filter(Boolean);
  if (!letters.length) return "?";
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0]).toUpperCase();
}

export function Deco() {
  return <div className="deco" aria-hidden="true" />;
}

/** The membership card: the guest's drawing and full name (Oct 16: nothing else; sign-up asks for nothing else). */
export default function MemberCard(props: { charName: string; figure: string | null }) {
  return (
    <div className="card">
      <div className="card-head">
        <span>The Velvet Room</span>
        <span>Member · 1929</span>
      </div>
      <div className="card-who">
        <div className="card-ph">{props.figure ? <img src={faceUrl(props.figure)} alt="" /> : initials(props.charName)}</div>
        <div className="card-name">{props.charName || "Your character"}</div>
      </div>
    </div>
  );
}
