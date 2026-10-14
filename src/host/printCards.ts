// The printable QR card sheet: every card at once (36), 12 to a letter page, 2.5-inch squares with
// dashed cut lines. Card N always carries the same code, so one printout serves every game.
// Drawn on canvas with the site's own fonts, then placed in a PDF made in the browser.

type Card = { number: number; code: string };

const PER_ROW = 3;
const ROWS = 4;
const SIZE_IN = 2.5;
const DPI = 300;
const PX = SIZE_IN * DPI; // 750 px per card
const RED = "#5e1020";
const INK = "#1b0a0e";

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`200px "Limelight"`),
      document.fonts.load(`700 30px "Josefin Sans"`),
      document.fonts.load(`italic 32px "Crimson Pro"`),
    ]);
  } catch {
    /* fall back to whatever serif is there */
  }
}

function drawCard(card: Card, url: string, qr: { size: number; get: (r: number, c: number) => number | boolean }): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PX;
  c.height = PX;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, PX, PX);
  // a double rule frame, like the site's cards
  g.strokeStyle = RED;
  g.lineWidth = 6;
  g.strokeRect(36, 36, PX - 72, PX - 72);
  g.lineWidth = 2;
  g.strokeRect(50, 50, PX - 100, PX - 100);

  g.textAlign = "center";
  g.fillStyle = RED;
  g.font = `700 26px "Josefin Sans", Futura, sans-serif`;
  const label = "EVIDENCE MARKER";
  // letter-spaced label
  const spaced = label.split("").join("  ");
  g.fillText(spaced, PX / 2, 108);

  g.fillStyle = INK;
  g.font = `120px "Limelight", Didot, Georgia, serif`;
  g.fillText(String(card.number), PX / 2, 228);

  // the QR code, drawn module by module so it stays crisp
  const box = 380;
  const n = qr.size;
  const quiet = 2;
  const cell = Math.floor(box / (n + quiet * 2));
  const real = cell * (n + quiet * 2);
  const x0 = Math.round((PX - real) / 2);
  const y0 = 262;
  g.fillStyle = "#ffffff";
  g.fillRect(x0, y0, real, real);
  g.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.get(r, col)) g.fillRect(x0 + (col + quiet) * cell, y0 + (r + quiet) * cell, cell, cell);
    }
  }

  g.fillStyle = INK;
  g.font = `italic 30px "Crimson Pro", Georgia, serif`;
  g.fillText("Scan with your Velvet Room phone", PX / 2, y0 + real + 50);
  g.fillStyle = "#7a5a5a";
  g.font = `600 17px "Josefin Sans", Futura, sans-serif`;
  g.fillText(url.replace(/^https?:\/\//, ""), PX / 2, y0 + real + 84);
  return c;
}

export async function downloadCardsPdf(cards: Card[], origin: string, title: string): Promise<void> {
  const [{ jsPDF }, QR] = await Promise.all([import("jspdf"), import("qrcode")]);
  await fontsReady();
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  const pageW = 8.5;
  const pageH = 11;
  const gridW = PER_ROW * SIZE_IN;
  const gridH = ROWS * SIZE_IN;
  const left = (pageW - gridW) / 2;
  const top = (pageH - gridH) / 2;
  const perPage = PER_ROW * ROWS;
  const pages = Math.ceil(cards.length / perPage);

  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage();
    const slice = cards.slice(p * perPage, (p + 1) * perPage);
    slice.forEach((card, i) => {
      const url = `${origin}/m/${card.code}`;
      const qr = QR.create(url, { errorCorrectionLevel: "M" }).modules;
      const canvas = drawCard(card, url, qr);
      const x = left + (i % PER_ROW) * SIZE_IN;
      const y = top + Math.floor(i / PER_ROW) * SIZE_IN;
      doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, SIZE_IN, SIZE_IN, undefined, "FAST");
    });
    // dashed cut lines through the whole grid, so each cut runs edge to edge
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.01);
    doc.setLineDashPattern([0.06, 0.05], 0);
    const rows = Math.ceil(slice.length / PER_ROW);
    for (let r = 0; r <= rows; r++) doc.line(left - 0.3, top + r * SIZE_IN, left + gridW + 0.3, top + r * SIZE_IN);
    for (let col = 0; col <= PER_ROW; col++) doc.line(left + col * SIZE_IN, top - 0.3, left + col * SIZE_IN, top + rows * SIZE_IN + 0.3);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(9);
    doc.setTextColor(120, 90, 90);
    const first = slice[0].number;
    const last = slice[slice.length - 1].number;
    doc.text(`${title} · QR cards ${first} to ${last} · page ${p + 1} of ${pages} · cut on the dashed lines`, pageW / 2, pageH - 0.3, { align: "center" });
  }
  doc.save("velvet-room-qr-cards.pdf");
}
