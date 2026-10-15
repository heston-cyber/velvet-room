import { weaponUrl } from "../lib/weapon";

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

export default function MemberCard(props: {
  charName: string;
  who: string;
  signature: string;
  photoUrl?: string | null;
  weapon?: { key: string; name: string } | null;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <span>The Velvet Room</span>
        <span>Member · 1929</span>
      </div>
      <div className="card-who">
        <div className="card-ph">
          {props.photoUrl ? <img src={props.photoUrl} alt="" /> : initials(props.charName)}
        </div>
        <div className="card-name">{props.charName || "Your character"}</div>
      </div>
      {props.who && <div className="card-desc">{props.who}</div>}
      <dl>
        <dt>Signature</dt>
        <dd>{props.signature || "—"}</dd>
        {props.weapon && (
          <>
            <dt>Weapon</dt>
            <dd className="card-weapon">
              <img src={weaponUrl(props.weapon.key)} alt="" />
              {props.weapon.name}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
