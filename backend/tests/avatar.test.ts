import { describe, it, expect } from "vitest";
import { AVATAR_COLORS, AVATAR_PRESETS, avatarOf, detectImage, isColor, isPreset } from "../src/modules/users/avatar";

describe("Profilbilder", () => {
  it("gibt nur ungefährliche Anzeigedaten heraus", () => {
    const a = avatarOf({ avatarPath: "avatars/x.png", avatarPreset: "cube", avatarColor: "#2563eb", avatarUpdatedAt: new Date("2026-11-05T10:00:00Z") });
    expect(a).toEqual({ photo: true, preset: "cube", color: "#2563eb", v: new Date("2026-11-05T10:00:00Z").getTime() });
    expect(JSON.stringify(a)).not.toContain("avatars/");
    expect(avatarOf({ avatarPath: null, avatarPreset: null, avatarColor: null, avatarUpdatedAt: null })).toEqual({ photo: false, preset: null, color: null, v: 0 });
  });
  it("lässt nur Symbole und Farben aus der festen Liste zu", () => {
    expect(AVATAR_PRESETS.every(isPreset)).toBe(true);
    expect(AVATAR_COLORS.every(isColor)).toBe(true);
    expect(isPreset("<script>")).toBe(false);
    expect(isColor("#000000")).toBe(false);
    expect(isColor("red")).toBe(false);
  });
  it("erkennt PNG und JPEG an den Bytes, alles andere nicht", () => {
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpg");
    expect(detectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImage(Buffer.from("GIF89a......"))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
  });
});
