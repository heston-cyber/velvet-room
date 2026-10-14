import { expect, test } from "vitest";
import { codeFromScan } from "../src/lib/scan";

test("marker codes come out of QR links and typed codes", () => {
  expect(codeFromScan("https://velvetroom.wranglerportal.com/m/k7qx2m")).toBe("k7qx2m");
  expect(codeFromScan("http://velvetroom.wranglerportal.com/m/K7QX2M?x=1")).toBe("k7qx2m");
  expect(codeFromScan("  q8kvrt ")).toBe("q8kvrt");
  expect(codeFromScan("https://example.com/menu")).toBeNull();
  expect(codeFromScan("not a code at all")).toBeNull();
});
