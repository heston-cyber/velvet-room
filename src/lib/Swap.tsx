import type { ReactNode } from "react";

/**
 * Every version of a line sits in the same spot; only the chosen one shows.
 * The space is always the size of the biggest version, so switching options
 * never moves anything below it (Heston's rule for the whole build).
 */
export function Swap(props: { show: number; children: ReactNode[]; className?: string }) {
  return (
    <div className={`swap ${props.className ?? ""}`}>
      {props.children.map((child, i) => (
        <div key={i} className={i === props.show ? "" : "off"} aria-hidden={i === props.show ? undefined : true}>
          {child}
        </div>
      ))}
    </div>
  );
}
