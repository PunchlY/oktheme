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
    const peak = this.solid(h);
    if (c >= peak.c) {
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

  Y() {
    const mainTRC = 2.4;
    const sRco = 0.2126478133913640;
    const sGco = 0.7151791475336150;
    const sBco = 0.0721730390750208;
    const { r, g, b } = clampRgb(toRgb(this));
    const exp = (c: number) => Math.pow(c, mainTRC);
    return sRco * exp(r) + sGco * exp(g) + sBco * exp(b);
  }

  bpca(background: Palette) {
    const normBG = 0.56;
    const normTXT = 0.57;
    const revTXT = 0.62;
    const revBG = 0.65;
    const blkThrs = 0.022;
    const blkClmp = 1.414;
    const scaleBoW = 1.14;
    const scaleWoB = 1.14;
    const loBoWoffset = 0.027;
    const loWoBoffset = 0.027;
    const bridgeWoBfact = 0.1414;
    const bridgeWoBpivot = 0.84;
    const loClip = 0.1;
    const deltaYmin = 0.0005;
    const clampY = (y: number) =>
      y < blkThrs ? y + Math.pow(blkThrs - y, blkClmp) : y;

    const fgY = clampY(this.Y());
    const bgY = clampY(background.Y());

    if (Math.abs(bgY - fgY) < deltaYmin) return 0;

    let output: number;
    if (bgY > fgY) {
      const sapc = (Math.pow(bgY, normBG) - Math.pow(fgY, normTXT)) * scaleBoW;
      output = sapc < loClip ? 0 : sapc - loBoWoffset;
    } else {
      const sapc = (Math.pow(bgY, revBG) - Math.pow(fgY, revTXT)) * scaleWoB;
      const bridge = Math.max(0, fgY / bridgeWoBpivot - 1) * bridgeWoBfact;
      output = sapc > -loClip ? 0 : sapc + loWoBoffset + bridge;
    }
    return output * 100;
  }

  ratio(background: Palette) {
    const lc = this.bpca(background);
    const maxY = Math.max(this.Y(), background.Y());

    const offsetA = 0.2693;
    const preScale = -0.0561;
    const powerShift = 4.537;

    const mainFactor = 1.113946;

    const loThresh = 0.3;
    const loExp = 0.48;
    const preEmph = 0.42;
    const postDe = 0.6594;

    const hiTrim = 0.0785;
    const loTrim = 0.0815;
    const trimThresh = 0.506; // #c0c0c0

    let addTrim = loTrim + hiTrim;
    if (maxY > trimThresh) {
      addTrim = loTrim * ((1 - maxY) / (1 - trimThresh)) + hiTrim;
    }

    const c = Math.max(0, Math.abs(lc) * 0.01);
    let ratio =
      (Math.pow(c + preScale, powerShift) + offsetA) * mainFactor * c + addTrim;

    ratio = ratio > loThresh
      ? 10 * ratio
      : c < 0.06
      ? 0
      : 10 * ratio - (Math.pow(loThresh - ratio + preEmph, loExp) - postDe);

    return ratio;
  }

  maxRatio(...foregrounds: [Palette, ...Palette[]]) {
    return foregrounds
      .map((color) => ({
        color,
        ratio: color.ratio(this),
      }))
      .sort((a, b) => a.ratio - b.ratio)
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
      : this.searchLight(ratio, key, this.l, maxL);
    const dark = minL >= this.l
      ? key.tone(minL)
      : this.searchDark(ratio, key, minL, this.l);
    return this.maxRatio(light, dark);
  }

  searchLc(
    contrast: number,
    key: Palette = this,
    minL = contrast > 0 ? 0 : this.l,
    maxL = contrast > 0 ? this.l : 1,
  ) {
    for (let i = 0; i < 24; i++) {
      const l = (minL + maxL) / 2;
      const actualContrast = key.tone(l).bpca(this);
      if (actualContrast > contrast) {
        minL = l;
      } else {
        maxL = l;
      }
    }
    return key.tone(contrast > 0 ? minL : maxL);
  }

  searchDark(
    ratio: number,
    key: Palette = this,
    minL = 0,
    maxL = this.l,
  ) {
    for (let i = 0; i < 24; i++) {
      const l = (minL + maxL) / 2;
      const actualRatio = key.tone(l).ratio(this);
      if (actualRatio > ratio) {
        minL = l;
      } else {
        maxL = l;
      }
    }
    return key.tone(minL);
  }

  searchLight(
    ratio: number,
    key: Palette = this,
    minL = this.l,
    maxL = 1,
  ) {
    for (let i = 0; i < 24; i++) {
      const l = (minL + maxL) / 2;
      const actualRatio = key.tone(l).ratio(this);
      if (actualRatio > ratio) {
        maxL = l;
      } else {
        minL = l;
      }
    }
    return key.tone(maxL);
  }

  log(...args: [format?: any, ...param: any[]]) {
    const bg = this.toRgb();
    const fg = this.foreground(4.5).toRgb();
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
