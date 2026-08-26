import type { Color } from "culori";
import {
  clampChroma,
  clampRgb,
  formatHex,
  interpolate,
  oklch,
  toGamut,
} from "culori";
import { formatWithOptions } from "node:util";

const toRgb = toGamut("rgb", "oklch");
const toOklch = toGamut("oklch", "oklch");

/** APCA-W3 constants (0.0.98G-4g-base) */
const APCA_SA98G = {
  mainTRC: 2.4,
  Rco: 0.2126729,
  Gco: 0.7151522,
  Bco: 0.0721750,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  loClip: 0.1,
  deltaYmin: 0.0005,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
} as const;

export class Palette {
  static convert(color?: Color | string) {
    const res = oklch(color);
    return res && new Palette(res.l, res.c, res.h);
  }

  static from(color: Color | string) {
    const { l, c, h } = toOklch(color);
    return new Palette(l, c, h);
  }

  static solid(h?: number) {
    const accuracy = 100;
    let l = 0, c = 0;
    for (let i = accuracy; i > 0; i--) {
      const actualColor = clampChroma({
        mode: "oklch",
        l: i / accuracy,
        c: 0.4,
        h,
      }, "oklch");
      if (actualColor.c > c) {
        l = actualColor.l;
        c = actualColor.c;
      }
    }
    return new Palette(l, c, h);
  }

  static key(c: number, h?: number, dark = true, lower = 0, upper = 1) {
    const eps = 1e-7;
    const peak = this.solid(h);
    if (c >= peak.c - eps) {
      return peak;
    }
    let minL = Math.max(dark ? lower : peak.l, lower);
    let maxL = Math.min(dark ? peak.l : upper, upper);
    for (let i = 0; i < 24; i++) {
      const l = (minL + maxL) / 2;
      const actual = clampChroma({ mode: "oklch", l, c, h }, "oklch");
      if (actual.c >= c) {
        if (dark) {
          maxL = l;
        } else {
          minL = l;
        }
      } else {
        if (dark) {
          minL = l;
        } else {
          maxL = l;
        }
      }
    }
    return new Palette(dark ? maxL : minL, c, h);
  }

  readonly mode = "oklch";
  constructor(
    public readonly l: number,
    public readonly c: number,
    public readonly h?: number,
  ) {}

  toRgb() {
    const { r, g, b } = clampRgb(toRgb(this));
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  toString() {
    return formatHex(clampRgb(toRgb(this)));
  }

  toJSON() {
    return {
      rgb: this.toRgb(),
      hex: this.toString(),
    };
  }

  apcaY() {
    const { r, g, b } = clampRgb(toRgb(this));
    function simpleExp(chan: number) {
      return Math.pow(chan, APCA_SA98G.mainTRC);
    }
    return APCA_SA98G.Rco * simpleExp(r) +
      APCA_SA98G.Gco * simpleExp(g) +
      APCA_SA98G.Bco * simpleExp(b);
  }

  apcaContrast(background: Palette): number {
    function clampY(y: number) {
      return y < APCA_SA98G.blkThrs
        ? y + Math.pow(APCA_SA98G.blkThrs - y, APCA_SA98G.blkClmp)
        : y;
    }
    const fgY = clampY(this.apcaY());
    const bgY = clampY(background.apcaY());
    if (Math.abs(fgY - bgY) < APCA_SA98G.deltaYmin) return 0;
    let SAPC = 0;
    let outputContrast = 0;
    if (bgY > fgY) {
      SAPC = (Math.pow(bgY, APCA_SA98G.normBG) -
        Math.pow(fgY, APCA_SA98G.normTXT)) * APCA_SA98G.scaleBoW;
      outputContrast = SAPC < APCA_SA98G.loClip
        ? 0
        : SAPC - APCA_SA98G.loBoWoffset;
    } else {
      SAPC =
        (Math.pow(bgY, APCA_SA98G.revBG) - Math.pow(fgY, APCA_SA98G.revTXT)) *
        APCA_SA98G.scaleWoB;
      outputContrast = SAPC > -APCA_SA98G.loClip
        ? 0
        : SAPC + APCA_SA98G.loWoBoffset;
    }
    return outputContrast * 100;
  }

  maxContrast(...foregrounds: [Palette, ...Palette[]]) {
    return foregrounds
      .map((color) => ({
        color,
        contrast: Math.abs(color.apcaContrast(this)),
      }))
      .sort((a, b) => a.contrast - b.contrast)
      .at(-1)!.color;
  }

  foreground(
    ratio: number,
    key: Palette = this,
    minL = 0,
    maxL = 1,
  ) {
    const light = maxL <= this.l
      ? key.tone(maxL)
      : this.searchApcaContrast(-ratio, key, this.l, maxL);
    const dark = minL >= this.l
      ? key.tone(minL)
      : this.searchApcaContrast(ratio, key, minL, this.l);
    return this.maxContrast(light, dark);
  }

  searchApcaContrast(
    contrast: number,
    key: Palette = this,
    minL = contrast > 0 ? 0 : this.l,
    maxL = contrast > 0 ? this.l : 1,
    chromaMultiplier?: number,
  ) {
    for (let i = 0; i < 24; i++) {
      const l = (minL + maxL) / 2;
      const actualColor = key.tone(l, chromaMultiplier);
      const actualContrast = actualColor.apcaContrast(this);
      if (actualContrast > contrast) {
        minL = l;
      } else {
        maxL = l;
      }
    }
    return key.tone(contrast > 0 ? minL : maxL);
  }

  log(...args: [format?: any, ...param: any[]]) {
    const bg = this.toRgb();
    const fg = this.foreground(60).toRgb();
    process.stderr.write(
      `\x1b[48;2;${bg.r};${bg.g};${bg.b}m\x1b[38;2;${fg.r};${fg.g};${fg.b}m`,
    );
    process.stderr.write(formatWithOptions({ colors: false }, ...args));
    process.stderr.write("\x1b[0m\x1b[0K");
  }

  tone(l = this.l, chromaMultiplier = 1) {
    const actualColor = clampChroma({
      ...this,
      l,
      c: this.c * chromaMultiplier,
    }, "oklch");
    return new Palette(actualColor.l, actualColor.c, actualColor.h);
  }

  blend(to: Color | string, amount: number) {
    return Palette.from(interpolate([this, to], "oklab")(amount));
  }

  dark() {
    return Palette.key(this.c, this.h, true);
  }

  light() {
    return Palette.key(this.c, this.h, false);
  }
}
