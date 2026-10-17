import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import MemberCard, { Deco } from "./MemberCard";
import { friendlyError } from "../lib/errors";
import { faceUrl, figureUrl } from "../lib/figure";

export type GameInfo = {
  slug: string;
  title: string;
  isTest: boolean;
  deadlineLabel: string;
  motiveMode: "game" | "players";
  killerOptIn: boolean;
};

// Oct 16 (Heston): no "about you" page (who you are, signature item, costume photo) and no weapon pick. Sign-up is
// your face, your last name and nickname, then a last look. Oct 17: the game always writes the motive and secret (D9),
// and everyone is in the killer draw unless they tick "I'd rather not be the killer" (D8).
export type ProfileValues = {
  realName: string;
  charName: string;
  motive: string;
  secret: string;
  killerOk: boolean;
  rumor: string;
  sayAs: string;
  /** The drawing they picked as their avatar. */
  figure: string;
  /** Party cast: their 1920s nickname and last name, typed here. */
  nickname: string;
  lastName: string;
  /** F6 (Oct 17): a mystery guest's own first name. */
  firstName: string;
};

export const EMPTY_PROFILE: ProfileValues = {
  realName: "",
  charName: "",
  motive: "",
  secret: "",
  killerOk: true,
  rumor: "",
  sayAs: "",
  figure: "",
  nickname: "",
  lastName: "",
  firstName: "",
};

const MAX: Record<keyof Omit<ProfileValues, "killerOk" | "figure">, number> = {
  realName: 60,
  charName: 60,
  motive: 280,
  secret: 280,
  rumor: 140,
  sayAs: 80,
  nickname: 24,
  lastName: 30,
  firstName: 24,
};

type StepId = "door" | "you" | "review";
type TextKey = keyof typeof MAX;

export default function ProfileForm(props: {
  game: GameInfo;
  mode: "new" | "edit";
  initial: ProfileValues;
  token?: string;
  /** Walk-ins sign up on party night with the room code from the TV. */
  roomCode?: string;
  onDone: (token: string) => void;
  onCancel?: () => void;
}) {
  const { game, mode } = props;
  // S9 (Oct 17): a walk-in at the door starts right on the faces.
  const walkIn = !!props.roomCode;
  const steps: StepId[] = useMemo(() => {
    const form: StepId[] = ["you", "review"];
    return mode === "new" && !walkIn ? ["door", ...form] : form;
  }, [mode, walkIn]);
  const formSteps: StepId[] = steps.filter((s) => s !== "door");

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<ProfileValues>(props.initial);
  const [bad, setBad] = useState<Set<TextKey>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needFigure, setNeedFigure] = useState(false);
  const gallery = useQuery(api.registration.figures, mode === "new" ? { slug: game.slug } : { token: props.token });
  // The party cast: tap your own face and that's who you are (the server fills in the name).
  const allFigures = gallery?.flatMap((g) => g.figures) ?? [];
  const castPick = allFigures.find((f) => f.key === values.figure) ?? null;
  function pickFigure(f: { key: string; name: string; castName: string; mystery?: boolean }) {
    setValues((v) => ({ ...v, figure: f.key, realName: f.mystery ? v.firstName || f.name : f.name, sayAs: "" }));
    setNeedFigure(false);
  }
  const mystery = !!castPick?.mystery;
  const firstName = mystery ? values.firstName.replace(/[“”"]/g, "").trim().split(/\s+/)[0] ?? "" : castPick?.name ?? "";
  // "Josh “Two-Tone” Lee": their first name from the cast, the rest as they type it (the server makes it final).
  const tidy = (s: string) => s.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  // Same as the server: a typed "aka" goes (the roll call says a.k.a. itself), and so does their own first name typed
  // again in the last-name box ("Heston Hill" → "Hill").
  const nick = (s: string) => tidy(s).replace(/^(a\.?\s*k\.?\s*a\.?|also known as)\s+/i, "");
  const last = (s: string) => (castPick && firstName ? tidy(s).replace(new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "") : tidy(s));
  const fullName = castPick ? [firstName || "Your name", nick(values.nickname) ? `“${nick(values.nickname)}”` : "", last(values.lastName)].filter(Boolean).join(" ") : "";
  const topRef = useRef<HTMLDivElement>(null);

  const register = useMutation(api.registration.register);
  const update = useMutation(api.registration.update);

  const step = steps[stepIndex];

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [stepIndex]);

  const requiredFor = (s: StepId): TextKey[] => {
    switch (s) {
      case "you":
        return castPick ? (castPick.mystery ? ["firstName", "lastName"] : ["lastName"]) : [];
      default:
        return [];
    }
  };

  function set<K extends keyof ProfileValues>(key: K, val: ProfileValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    if (typeof val === "string" && val.trim()) {
      setBad((b) => {
        if (!b.has(key as TextKey)) return b;
        const n = new Set(b);
        n.delete(key as TextKey);
        return n;
      });
    }
  }

  function next() {
    const missing = requiredFor(step).filter((k) => !values[k].trim());
    if (missing.length) {
      setBad(new Set(missing));
      document.getElementById(`f-${missing[0]}`)?.focus();
      return;
    }
    if (step === "you" && !values.figure) {
      setNeedFigure(true);
      document.getElementById("f-figure")?.focus();
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }

  function back() {
    setError(null);
    if (stepIndex === 0) props.onCancel?.();
    else setStepIndex((i) => i - 1);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...values, figure: values.figure || undefined };
      if (mode === "new") {
        const { token } = await register({ slug: game.slug, roomCode: props.roomCode, ...payload });
        props.onDone(token);
      } else {
        await update({ token: props.token!, ...payload });
        props.onDone(props.token!);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function field(key: TextKey, label: string, opts: { area?: boolean; ph?: string; help?: string; publicHelp?: boolean } = {}) {
    const isBad = bad.has(key);
    const common = {
      id: `f-${key}`,
      value: values[key],
      placeholder: opts.ph,
      maxLength: MAX[key],
      "aria-invalid": isBad || undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
    };
    return (
      <div className={`field${isBad ? " bad" : ""}`}>
        <label htmlFor={`f-${key}`}>{label}</label>
        {opts.area ? <textarea rows={3} {...common} /> : <input type="text" autoComplete="off" {...common} />}
        {opts.help && <span className={`help${opts.publicHelp ? " public" : ""}`}>{opts.help}</span>}
        {isBad && <span className="err">Fill this in to continue.</span>}
      </div>
    );
  }

  const progress = (
    <div className="progress">
      <div className="dots" aria-hidden="true">
        {formSteps.map((s, i) => (
          <i key={s} className={i <= formSteps.indexOf(step) ? "on" : ""} />
        ))}
      </div>
      <span>
        Step {formSteps.indexOf(step) + 1} of {formSteps.length}
      </span>
    </div>
  );

  const nav = (label: string) => (
    <div className="actions">
      <button type="button" className="primary" onClick={next}>
        {label}
      </button>
      {(stepIndex > 0 || props.onCancel) && (
        <button type="button" className="back" onClick={back}>
          ← {stepIndex === 0 ? "Cancel" : "Back"}
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  switch (step) {
    case "door":
      body = (
        <div className="door">
          <span className="eyebrow">New York City · October 31, 1929</span>
          <Deco />
          <h1 className="title-xl">The Velvet Room</h1>
          <p className="lede">
            Don Ray Sanders requests your company for a private evening. Before you arrive, the house needs to
            know who you are.
          </p>
          <div className="actions wide">
            <button type="button" className="primary" onClick={next}>
              Step inside
            </button>
          </div>
          <span className="small">
            {props.roomCode ? "About a minute. The game starts once everyone's in, so be quick." : "About a minute. You can change your answers until the doors open on party night."}
          </span>
        </div>
      );
      break;
    case "you":
      body = (
        <>
          {progress}
          <h2>{mode === "new" ? "Who's at the door?" : "Edit your entry"}</h2>
          <p className="lede">Find your face and tap it. That's you on the TV tonight, by name.</p>
          <div className={`field${needFigure ? " bad" : ""}`}>
            <span className="lab" id="l-figure">
              Tonight's cast
            </span>
            <div className="figure-pick" role="radiogroup" aria-labelledby="l-figure" id="f-figure" tabIndex={-1}>
              {gallery === undefined && <span className="help">Loading the cast…</span>}
              {gallery?.map((group) => (
                <div className="figure-set" key={group.label}>
                  <span className="small">{group.label}</span>
                  <div className="figure-grid named">
                    {group.figures.map((f) => {
                      const takenByOther = f.taken && values.figure !== f.key;
                      return (
                        <div className="figure-cell" key={f.key}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={values.figure === f.key}
                            aria-label={takenByOther ? `${f.name}, taken` : f.name}
                            disabled={takenByOther}
                            className={`${values.figure === f.key ? "on" : ""} ${takenByOther ? "taken" : ""}`}
                            onClick={() => pickFigure(f)}
                          >
                            <img src={faceUrl(f.key)} alt="" />
                            {takenByOther && <span>Taken</span>}
                          </button>
                          <span className="figure-name">{f.mystery ? (f.key === "mystery-f" ? "Woman" : "Man") : f.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {castPick && (
              <div className="figure-chosen">
                <img src={figureUrl(castPick.key)} alt="" />
                <span className="help">
                  <strong className="figure-chosen-name">{fullName}</strong>
                  {mystery ? "A mystery guest. Type your name below." : "That's you. Not you? Tap your own face."}
                </span>
              </div>
            )}
            {needFigure && <span className="err">Tap your face to continue.</span>}
            {/* F6 (Oct 17): a face someone else tapped by mistake can be freed by the host. */}
            <span className="help">Your face says Taken? Ask your host to free it. Not in the cast? Pick a mystery guest and type your name.</span>
          </div>
          {castPick && (
            <>
              {mystery && field("firstName", "Your first name", { ph: "e.g. Ruth" })}
              {field("lastName", "Your last name", { ph: "e.g. Hill" })}
              {field("nickname", "Your 1920s nickname · optional", {
                ph: "e.g. Two-Tone, The Knife, Lucky",
                help: "Just the nickname: Two-Tone, not “aka Two-Tone”. The narrator adds the a.k.a.",
                publicHelp: true,
              })}
            </>
          )}
          {nav("Next: last look")}
        </>
      );
      break;
    case "review":
      body = (
        <>
          {progress}
          <h2>Last look</h2>
          <MemberCard charName={fullName || values.charName} figure={values.figure || null} />
          <p className="help">The house writes your motive and your secret. Your role arrives on your phone right after the roll call.</p>
          <label className="optin" htmlFor="f-killer">
            <input type="checkbox" id="f-killer" checked={!values.killerOk} onChange={(e) => set("killerOk", !e.target.checked)} />
            <span>
              <strong>I'd rather not be the killer</strong>
              <span>Everyone can be drawn as the killer unless they tick this. Nobody else sees it.</span>
            </span>
          </label>
          {error && (
            <div className="errbox" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : mode === "new" ? "Put me on the list" : "Save changes"}
            </button>
            <button type="button" className="back" onClick={back} disabled={busy}>
              ← Back
            </button>
          </div>
        </>
      );
      break;
  }

  return (
    <div className="screen" ref={topRef}>
      {game.isTest && <div className="testflag">Test game · not the real party</div>}
      {body}
    </div>
  );
}
