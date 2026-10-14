import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Wi-Fi join code that iPhone and Android cameras understand. */
export function wifiQrText(name: string, password: string): string {
  const esc = (v: string) => v.replace(/([\;,:"])/g, "\\$1");
  return password ? `WIFI:T:WPA;S:${esc(name)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(name)};;`;
}

/** A QR code as an inline SVG (crisp on a TV and on paper). */
export function Qr(props: { text: string; className?: string; label: string; dark?: string; light?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(props.text, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: props.dark ?? "#120509", light: props.light ?? "#ffffff" },
    }).then(
      (s) => live && setSvg(s),
      () => live && setSvg(""),
    );
    return () => {
      live = false;
    };
  }, [props.text, props.dark, props.light]);
  return <div className={props.className} role="img" aria-label={props.label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
