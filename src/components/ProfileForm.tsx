import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import MemberCard, { Deco } from "./MemberCard";
import { shrinkPhoto, uploadPhoto } from "../lib/photo";
import { friendlyError } from "../lib/errors";
import { ROLL_PROMPT } from "../../convex/narration";
import { avatarSrc, faceUrl, figureUrl } from "../lib/figure";
import { weaponUrl } from "../lib/weapon";

export type GameInfo = {
  slug: string;
  title: string;
  isTest: boolean;
  deadlineLabel: string;
  motiveMode: "game" | "players";
  killerOptIn: boolean;
};

export type ProfileValues = {
  realName: string;
  charName: string;
  who: string;
  signature: string;
  motive: string;
  secret: string;
  /** The weapon they picked from the pool (a key). */
  weapon: string;
  killerOk: boolean;
  rumor: string;
  sayAs: string;
  /** The drawing they picked as their avatar. */
  figure: string;
};

export const EMPTY_PROFILE: ProfileValues = {
  realName: "",
  charName: "",
  who: "",
  signature: "",
  motive: "",
  secret: "",
  weapon: "",
  killerOk: true,
  rumor: "",
  sayAs: "",
  figure: "",
};

const MAX: Record<keyof Omit<ProfileValues, "killerOk" | "figure" | "weapon">, number> = {
  realName: 60,
  charName: 60,
  who: 280,
  signature: 120,
  motive: 280,
  secret: 280,
  rumor: 140,
  sayAs: 80,
};

type StepId = "door" | "you" | "character" | "motive" | "weapon" | "review";
type TextKey = keyof typeof MAX;

export default function ProfileForm(props: {
  game: GameInfo;
  mode: "new" | "edit";
  initial: ProfileValues;
  initialPhotoUrl?: string | null;
  token?: string;
  onDone: (token: string) => void;
  onCancel?: () => void;
}) {
  const { game, mode } = props;
  const steps: StepId[] = useMemo(
    () => (mode === "new" ? ["door", "you", "character", "motive", "weapon", "review"] : ["you", "character", "motive", "weapon", "review"]),
    [mode],
  );
  const formSteps: StepId[] = steps.filter((s) => s !== "door");

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<ProfileValues>(props.initial);
  const [bad, setBad] = useState<Set<TextKey>>(new Set());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(props.initialPhotoUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needFigure, setNeedFigure] = useState(false);
  const [needWeapon, setNeedWeapon] = useState(false);
  const gallery = useQuery(api.registration.figures, mode === "new" ? { slug: game.slug } : { token: props.token });
  const rack = useQuery(api.registration.weapons, mode === "new" ? { slug: game.slug } : { token: props.token });
  const weaponName = rack?.find((w) => w.key === values.weapon)?.name ?? "";
  const topRef = useRef<HTMLDivElement>(null);

  const generateUploadUrl = useMutation(api.registration.generateUploadUrl);
  const register = useMutation(api.registration.register);
  const update = useMutation(api.registration.update);

  const step = steps[stepIndex];

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [stepIndex]);

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const requiredFor = (s: StepId): TextKey[] => {
    switch (s) {
      case "you":
        return ["realName"];
      case "character":
        return ["charName", "who", "signature"];
      case "motive":
        return game.motiveMode === "players" ? ["motive", "secret"] : [];
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
    if (step === "weapon" && !values.weapon) {
      setNeedWeapon(true);
      document.getElementById("f-weapon")?.focus();
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
      let photoId: Id<"_storage"> | undefined;
      if (photoFile) {
        const blob = await shrinkPhoto(photoFile);
        const url = await generateUploadUrl({ slug: game.slug });
        photoId = (await uploadPhoto(url, blob)) as Id<"_storage">;
      }
      const payload = { ...values, figure: values.figure || undefined, photoId };
      if (mode === "new") {
        const { token } = await register({ slug: game.slug, ...payload });
        props.onDone(token);
      } else {
        await update({ token: props.token!, ...payload, removePhoto });
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
          <span className="eyebrow">Chicago · October 31, 1929</span>
          <Deco />
          <h1 className="title-xl">The Velvet Room</h1>
          <p className="lede">
            Don Carmine Velluto requests your company for a private evening. Before you arrive, the house needs to
            know who you are.
          </p>
          <div className="actions wide">
            <button type="button" className="primary" onClick={next}>
              Step inside
            </button>
          </div>
          <span className="small">About 3 minutes. You can change your answers until {game.deadlineLabel}.</span>
        </div>
      );
      break;
    case "you":
      body = (
        <>
          {progress}
          <h2>{mode === "new" ? "Who's at the door?" : "Edit your entry"}</h2>
          <p className="lede">Your real name, so the host knows you RSVP'd.</p>
          {field("realName", "Your name", {
            ph: "e.g. Jordan Reyes",
            help: "Only the host sees this, next to your character's name.",
          })}
          <div className={`field${needFigure ? " bad" : ""}`}>
            <span className="lab" id="l-figure">
              Pick your character drawing
            </span>
            <span className="help">
              It's you on the TV tonight. Each drawing goes to one guest, so grab yours.
              {gallery?.some((g) => g.figures.some((f) => f.name)) && " If there's a drawing of you, it's in the first row with your name on it."}
            </span>
            <div className="figure-pick" role="radiogroup" aria-labelledby="l-figure" id="f-figure" tabIndex={-1}>
              {gallery === undefined && <span className="help">Loading the drawings…</span>}
              {gallery?.map((group) => (
                <div className="figure-set" key={group.label}>
                  <span className="small">{group.label}</span>
                  <div className={`figure-grid${group.figures.some((f) => f.name) ? " named" : ""}`}>
                    {group.figures.map((f) => {
                      const takenByOther = f.taken && values.figure !== f.key;
                      const button = (
                        <button
                          type="button"
                          key={f.key}
                          role="radio"
                          aria-checked={values.figure === f.key}
                          aria-label={takenByOther ? `${f.name ? `${f.name}'s drawing, ` : ""}taken` : f.name ? `${f.name}'s drawing` : `Drawing ${f.key}`}
                          disabled={takenByOther}
                          className={`${values.figure === f.key ? "on" : ""} ${takenByOther ? "taken" : ""}`}
                          onClick={() => {
                            set("figure", f.key);
                            setNeedFigure(false);
                          }}
                        >
                          <img src={faceUrl(f.key)} alt="" />
                          {takenByOther && <span>Taken</span>}
                        </button>
                      );
                      // A guest's look-alike carries their name underneath.
                      return f.name ? (
                        <div className="figure-cell" key={f.key}>
                          {button}
                          <span className="figure-name">{f.name}</span>
                        </div>
                      ) : (
                        button
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {values.figure && (
              <div className="figure-chosen">
                <img src={figureUrl(values.figure)} alt="Your drawing" />
                <span className="help">That's you. Change it any time before sign-ups close.</span>
              </div>
            )}
            {needFigure && <span className="err">Pick a drawing to continue.</span>}
          </div>
          {nav("Next: your character")}
        </>
      );
      break;
    case "character":
      body = (
        <>
          {progress}
          <h2>Who are you tonight?</h2>
          <p className="lede">Anyone at all. Random and funny is welcome.</p>
          {field("charName", "Character name", { ph: "e.g. Velma “Two-Bits” Kowalski" })}
          {field("sayAs", "Say it like · optional", {
            ph: "e.g. VEL-muh too-BITS koh-WAL-skee",
            help: "Only if the name is tricky. It's how the narrator will pronounce it.",
          })}
          {field("who", "Who they are, in a line or two", {
            area: true,
            ph: "e.g. Cigarette girl who knows every secret in the joint and sells them by the pack.",
          })}
          {field("rumor", ROLL_PROMPT.label, {
            area: true,
            ph: ROLL_PROMPT.placeholder,
            help: ROLL_PROMPT.help,
            publicHelp: true,
          })}
          {field("signature", "Signature item or habit", {
            ph: "e.g. A silver cigarette case she never opens",
            help: "Everyone will see this. Clues may point to it, so wear it or carry it.",
            publicHelp: true,
          })}
          <div className="field">
            <span className="lab">Costume photo · optional</span>
            <div className="photo">
              <div className="ph">{photoPreview && !removePhoto ? <img src={photoPreview} alt="" /> : "None"}</div>
              <label className="pick" htmlFor="f-photo">
                {photoPreview && !removePhoto ? "Change photo" : "Choose a photo"}
              </label>
              <input
                type="file"
                id="f-photo"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPhotoFile(f);
                  setRemovePhoto(false);
                  setPhotoPreview(URL.createObjectURL(f));
                }}
              />
              {photoPreview && !removePhoto && (
                <button
                  type="button"
                  className="back"
                  onClick={() => {
                    setPhotoFile(null);
                    setRemovePhoto(true);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            <span className="help">No costume yet? Add one later from your personal link.</span>
          </div>
          {nav("Next: motive and secret")}
        </>
      );
      break;
    case "motive":
      body =
        game.motiveMode === "game" ? (
          <>
            {progress}
            <h2>Everyone here has a reason</h2>
            <div className="sealed">
              <div className="wax" aria-hidden="true">
                V
              </div>
              <p>
                The house will write your motive and your secret from your character. They arrive on your phone
                when the game begins, and only you see them.
              </p>
            </div>
            <p className="help">You may lie about your secret. Only the killer may lie about the murder.</p>
            {nav("Next: your weapon")}
          </>
        ) : (
          <>
            {progress}
            <h2>Everyone here has a reason</h2>
            <p className="lede">
              Only you will see these. You may lie about your secret. Only the killer may lie about the murder.
            </p>
            {field("motive", "Why might you have wanted the Don dead?", {
              area: true,
              ph: "e.g. He owes me three months of tips and laughed when I asked.",
            })}
            {field("secret", "A secret you'd lie to protect", {
              area: true,
              ph: "e.g. I've been selling his ledger pages to the Feds.",
            })}
            {nav("Next: your weapon")}
          </>
        );
      break;
    case "weapon":
      body = (
        <>
          {progress}
          <h2>Pick your weapon</h2>
          <p className="lede">Every guest gets a murder weapon. Each one goes to one guest, so grab yours.</p>
          <div className={`field${needWeapon ? " bad" : ""}`}>
            <span className="lab" id="l-weapon">
              Your weapon
            </span>
            <span className="help public">Everyone will see the weapons in play, and the TV shows yours with your character.</span>
            <div className="weapon-grid" role="radiogroup" aria-labelledby="l-weapon" id="f-weapon" tabIndex={-1}>
              {rack === undefined && <span className="help">Loading the weapons…</span>}
              {rack?.map((w) => {
                const takenByOther = w.taken && values.weapon !== w.key;
                return (
                  <button
                    type="button"
                    key={w.key}
                    role="radio"
                    aria-checked={values.weapon === w.key}
                    aria-label={takenByOther ? `${w.name}, taken` : w.name}
                    disabled={takenByOther}
                    className={`${values.weapon === w.key ? "on" : ""} ${takenByOther ? "taken" : ""}`}
                    onClick={() => {
                      set("weapon", w.key);
                      setNeedWeapon(false);
                    }}
                  >
                    <img src={weaponUrl(w.key)} alt="" />
                    <span className="weapon-name">{takenByOther ? "Taken" : w.name}</span>
                  </button>
                );
              })}
            </div>
            {needWeapon && <span className="err">Pick a weapon to continue.</span>}
          </div>
          {nav("Next: review")}
        </>
      );
      break;
    case "review":
      body = (
        <>
          {progress}
          <h2>Last look</h2>
          <MemberCard
            charName={values.charName}
            who={values.who}
            signature={values.signature}
            photoUrl={avatarSrc(removePhoto ? null : photoPreview, values.figure)}
            weapon={values.weapon ? { key: values.weapon, name: weaponName } : null}
          />
          {game.killerOptIn && (
            <label className="optin" htmlFor="f-killer">
              <input
                type="checkbox"
                id="f-killer"
                checked={values.killerOk}
                onChange={(e) => set("killerOk", e.target.checked)}
              />
              <span>
                <strong>I'm up for being the killer</strong>
                <span>
                  If the game picks you, you'll find out on your phone when the game starts. Nobody else will know. If fewer than 3 guests opt in, everyone is in the running.
                </span>
              </span>
            </label>
          )}
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
