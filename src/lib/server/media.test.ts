import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { InvalidImageError, processImage } from "./media";

async function jpeg(width: number, height: number, withExif = false) {
  let img = sharp({ create: { width, height, channels: 3, background: "#2546d8" } });
  if (withExif) img = img.withMetadata({ exif: { IFD0: { Make: "TestCam", Model: "GPS here" } }, orientation: 6 });
  return img.jpeg().toBuffer();
}

describe("processImage", () => {
  it("makes three sizes and applies rotation", async () => {
    const r = await processImage(await jpeg(2048, 1536, true));
    // Orientation 6 means rotate 90 degrees, so width and height swap.
    expect(r.width).toBe(1536);
    expect(r.height).toBe(2048);
    const thumb = await sharp(r.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(480);
    const display = await sharp(r.display).metadata();
    expect(Math.max(display.width!, display.height!)).toBe(1600);
  });

  it("strips camera metadata such as GPS", async () => {
    const r = await processImage(await jpeg(800, 600, true));
    for (const buf of [r.original, r.display, r.thumb]) {
      const meta = await sharp(buf).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
    }
  });

  it("rejects files that aren't images, and tiny images", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toBeInstanceOf(InvalidImageError);
    await expect(processImage(await jpeg(100, 100))).rejects.toBeInstanceOf(InvalidImageError);
  });
});
