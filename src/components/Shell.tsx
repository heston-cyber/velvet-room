import type { ReactNode } from "react";

/** Phone-width column on a red velvet ground. */
export default function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={wide ? "shell wide" : "shell"}>{children}</main>;
}

export function Loading() {
  return (
    <Shell>
      <div className="screen center">
        <div className="deco" aria-hidden="true" />
        <p className="lede">Checking the guest list…</p>
      </div>
    </Shell>
  );
}
