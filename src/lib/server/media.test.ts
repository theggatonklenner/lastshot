import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { InvalidImageError, processImage, servedPath, watermarkedPath } from "./media";

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

describe("watermarks", () => {
  it("makes watermarked copies only when asked, at the same size", async () => {
    const input = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#88aacc" } }).jpeg().toBuffer();
    const plain = await processImage(input);
    expect(plain.originalWm).toBeUndefined();
    const marked = await processImage(input, { watermark: true });
    const meta = await sharp(marked.originalWm!).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 900]);
    // Bottom-left corner changed, top-right didn't.
    const px = async (buf: Buffer, x: number, y: number) =>
      (await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())[0];
    expect(Math.abs((await px(marked.originalWm!, 120, 840)) - (await px(plain.original, 120, 840)))).toBeGreaterThan(20);
    expect(Math.abs((await px(marked.originalWm!, 1150, 30)) - (await px(plain.original, 1150, 30)))).toBeLessThan(6);
  });
  it("maps paths and serves clean files once upgraded", () => {
    expect(watermarkedPath("e/photos/p/original.jpg")).toBe("e/photos/p/original.wm.jpg");
    expect(servedPath("a/display.jpg", { watermarked: true }, { plan: "free" })).toBe("a/display.wm.jpg");
    expect(servedPath("a/display.jpg", { watermarked: true }, { plan: "small" })).toBe("a/display.jpg");
    expect(servedPath("a/display.jpg", { watermarked: false }, { plan: "free" })).toBe("a/display.jpg");
  });
});
