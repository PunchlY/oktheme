#!/usr/bin/env bun
import { argv } from "bun";
import type { Color } from "culori";
import {
  clampChroma,
  differenceEuclidean,
  formatHex,
  interpolate,
  lerp,
  oklab,
  oklch,
  toGamut,
  trilerp,
  wcagContrast,
} from "culori";
import { formatWithOptions } from "node:util";

const toRgb = toGamut("rgb", "oklch");
const toOklch = toGamut("oklch", "oklch");
const deltaEOK = differenceEuclidean("oklab");

class Palette {
  static convert(color: Color | string) {
    const res = oklch(color);
    if (!res) {
      return;
    }
    return new Palette(res.l, res.c, res.h);
  }

  static from(color: Color | string) {
    const { l, c, h } = toOklch(color);
    return new Palette(l, c, h);
  }

  static solid(h?: number) {
    const accuracy = 100;
    let best = { l: 0, c: 0 };
    for (let i = accuracy; i >= 0; i--) {
      const l = i / accuracy;
      const { c } = clampChroma({ mode: "oklch", l, c: 0.4, h }, "oklch");
      if (c > best.c) {
        best = { l, c };
      }
    }
    return new Palette(best.l, best.c, h);
  }

  static key(c: number, h?: number, dark = true) {
    const eps = 1e-7;
    const peak = this.solid(h);
    if (c >= peak.c - eps) {
      return new Palette(peak.l, peak.c, h);
    }
    let lo = dark ? 0 : peak.l;
    let hi = dark ? peak.l : 1;
    for (let i = 0; i < 24; i++) {
      const l = (lo + hi) / 2;
      const { c: actualC } = clampChroma({ mode: "oklch", l, c, h }, "oklch");
      if (actualC >= c - eps) {
        if (dark) {
          hi = l;
        } else {
          lo = l;
        }
      } else {
        if (dark) {
          lo = l;
        } else {
          hi = l;
        }
      }
    }
    const finalL = dark ? hi : lo;
    return new Palette(finalL, c, h);
  }

  readonly mode = "oklch";
  constructor(
    public readonly l: number,
    public readonly c: number,
    public readonly h?: number,
  ) {}

  toRgb() {
    const { r, g, b } = toRgb(this);
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  toString() {
    return formatHex(toRgb(this));
  }

  toJSON() {
    return {
      rgb: this.toRgb(),
      hex: this.toString(),
    };
  }

  // lighter(deltaE: number, color: Palette = this) {
  //   const eps = 1e-7;
  //   let lo = color.l;
  //   let hi = 1;
  //   for (let i = 0; i < 24; i++) {
  //     const l = (lo + hi) / 2;
  //     const actualColor = color.palette(l);
  //     const actualDeltaE = deltaEOK(actualColor, this);
  //     if (actualDeltaE >= deltaE - eps) {
  //       hi = l;
  //     } else {
  //       lo = l;
  //     }
  //   }
  //   return color.palette(hi);
  // }

  // darker(deltaE: number, color: Palette = this) {
  //   const eps = 1e-7;
  //   let lo = 0;
  //   let hi = color.l;
  //   for (let i = 0; i < 24; i++) {
  //     const l = (lo + hi) / 2;
  //     const actualColor = color.palette(l);
  //     const actualDeltaE = deltaEOK(actualColor, this);
  //     if (actualDeltaE >= deltaE - eps) {
  //       lo = l;
  //     } else {
  //       hi = l;
  //     }
  //   }
  //   return color.palette(lo);
  // }

  // foreground(deltaE: number, color: Palette = this) {
  //   const light = this.lighter(deltaE, color);
  //   const dark = this.darker(deltaE, color);
  //   return deltaEOK(light, this) >= deltaEOK(dark, this) ? light : dark;
  // }

  foreground(ratio: number, color: Palette = this) {
    const light = this.lighter(ratio, color);
    const dark = this.darker(ratio, color);
    const lighterRatio = wcagContrast(light, this);
    const darkerRatio = wcagContrast(dark, this);
    return lighterRatio >= darkerRatio ? light : dark;
  }

  // lighter(ratio: number, color: Palette = this) {
  //   const dark = xyz65(this);
  //   const light = { ...dark, y: ratio * (dark.y + 0.05) - 0.05 };
  //   return color.palette(oklch(light).l);
  // }
  lighter(ratio: number, color: Palette = this) {
    const eps = 1e-7;
    let lo = color.l;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const l = (lo + hi) / 2;
      const actualColor = color.palette(l);
      const actualDeltaE = wcagContrast(actualColor, this);
      if (actualDeltaE >= ratio - eps) {
        hi = l;
      } else {
        lo = l;
      }
    }
    return color.palette(hi);
  }

  // darker(ratio: number, color: Palette = this) {
  //   const light = xyz65(this);
  //   const dark = { ...light, y: (light.y + 0.05) / ratio - 0.05 };
  //   return color.palette(oklch(dark).l);
  // }
  darker(ratio: number, color: Palette = this) {
    const eps = 1e-7;
    let lo = 0;
    let hi = color.l;
    for (let i = 0; i < 24; i++) {
      const l = (lo + hi) / 2;
      const actualColor = color.palette(l);
      const actualDeltaE = wcagContrast(actualColor, this);
      if (actualDeltaE >= ratio - eps) {
        lo = l;
      } else {
        hi = l;
      }
    }
    return color.palette(lo);
  }

  log(...args: [format?: any, ...param: any[]]) {
    const bg = this.toRgb();
    const fg = this.foreground(7.5).toRgb();
    process.stderr.write(
      `\x1b[48;2;${bg.r};${bg.g};${bg.b}m\x1b[38;2;${fg.r};${fg.g};${fg.b}m`,
    );
    process.stderr.write(formatWithOptions({ colors: false }, ...args));
    process.stderr.write("\x1b[0m\x1b[0K");
  }

  palette(lightness: number, chromaMultiplier = 1) {
    const { l, c, h } = clampChroma({
      ...this,
      l: lightness,
      c: this.c * chromaMultiplier,
    }, "oklch");
    return new Palette(l, c, h);
  }

  blend(to: Color | string, amount: number) {
    return Palette.from(interpolate([this, to], "oklab")(amount));
  }

  generalRoles<T extends string>(
    type: T,
    background: Palette,
  ): Record<string, Palette> {
    return {
      [`${type}_palette_key_color`]: this,
      get [type]() {
        return background.foreground(4.5, this[`${type}_palette_key_color`]);
      },
      get [`${type}_dim`]() {
        return this[type]!.darker(1.25);
      },
      get [`on_${type}`]() {
        return this[type]!.foreground(6);
      },
      get [`${type}_container`]() {
        const a = background.foreground(1.5, this[`${type}_palette_key_color`]);
        const b = this[`${type}_dim`]!.darker(2);
        return deltaEOK(a, this[`${type}_dim`]!) >=
            deltaEOK(b, this[`${type}_dim`]!)
          ? a
          : b;
      },
      get [`on_${type}_container`]() {
        return this[`${type}_container`]!.foreground(6);
      },
      // get [`${type}_fixed`]() {
      //   return background.foreground(1.5, this[`${type}_palette_key_color`]);
      // },
      // get [`${type}_fixed_dim`]() {
      //   return this[`${type}_fixed`]!.darker(1.25);
      // },
      // get [`on_${type}_fixed`]() {
      //   return this[`${type}_fixed`]!.foreground(7);
      // },
      // get [`on_${type}_fixed_variant`]() {
      //   return this[`${type}_fixed_dim`]!.foreground(4.5);
      // },
    };
  }
}

const sources = argv.slice(2).map(Palette.convert);
const blendAmount = 0.1;

const source0 = sources[0] ?? Palette.solid(210);
const source1 = sources[1] ?? source0;
const source2 = sources[2] ?? Palette.key(source1.c, (source1.h ?? 0) + 60);

const redKey = Palette.key(.156, 30).blend(source0, blendAmount);
const greenKey = Palette.key(.156, 150, true).blend(source0, blendAmount);
const yellowKey = Palette.key(.156, 90, true).blend(source0, blendAmount);
const blueKey = Palette.key(.156, 270).blend(source0, blendAmount);
const magentaKey = Palette.key(.156, 330).blend(source0, blendAmount);
const cyanKey = Palette.key(.156, 210, true).blend(source0, blendAmount);

const primaryKey = Palette.key(.087, source1.h);
const secondaryKey = Palette.key(.053, source1.h);
const tertiaryKey = Palette.key(.093, source2.h);
const errorKey = redKey;
const neutralKey = Palette.key(.017, source0.h);

const surfaceColors: Record<string, Palette> = {
  surface: neutralKey.palette(.13),
  surface_dim: neutralKey.palette(.13),
  surface_bright: neutralKey.palette(.3, 1.7),
  surface_container_lowest: neutralKey.palette(.0),
  surface_container_low: neutralKey.palette(.07, 1.25),
  surface_container: neutralKey.palette(.14, 1.4),
  surface_container_high: neutralKey.palette(.21, 1.5),
  surface_container_highest: neutralKey.palette(.28, 1.7),
  get on_surface() {
    return this.surface_bright!.foreground(11);
  },
  get outline() {
    return this.surface_bright!.foreground(3);
  },
  get outline_variant() {
    return this.surface_bright!.foreground(1.5);
  },
  inverse_surface: neutralKey.palette(.9),
  get inverse_on_surface() {
    return this.inverse_surface!.foreground(7);
  },
  shadow: neutralKey.palette(.0),
  scrim: neutralKey.palette(.0),
};

const colors: Record<string, Palette> = {
  source0,
  source1,
  source2,

  ...surfaceColors,
  ...primaryKey.generalRoles("primary", surfaceColors.surface_bright!),
  get inverse_primary() {
    const light = Palette.key(primaryKey.c, primaryKey.h, false);
    const dark = Palette.key(primaryKey.c, primaryKey.h, true);
    return wcagContrast(light, surfaceColors.surface_bright!) >=
        wcagContrast(dark, this.inverse_surface!)
      ? light
      : dark;
  },
  ...secondaryKey.generalRoles("secondary", surfaceColors.surface_bright!),
  ...tertiaryKey.generalRoles("tertiary", surfaceColors.surface_bright!),
  ...errorKey.generalRoles("error", surfaceColors.surface_bright!),

  get background() {
    return this.surface!;
  },
  get on_background() {
    return this.on_surface!;
  },
  get surface_variant() {
    return this.surface_container_highest!;
  },
  get on_surface_variant() {
    return this.surface_variant!.foreground(.5);
  },
  get surface_tint() {
    return this.primary!;
  },
  ...redKey.generalRoles("red", surfaceColors.surface_bright!),
  ...greenKey.generalRoles("green", surfaceColors.surface_bright!),
  ...yellowKey.generalRoles("yellow", surfaceColors.surface_bright!),
  ...blueKey.generalRoles("blue", surfaceColors.surface_bright!),
  ...magentaKey.generalRoles("magenta", surfaceColors.surface_bright!),
  ...cyanKey.generalRoles("cyan", surfaceColors.surface_bright!),
};

const color256 = function* () {
  yield colors.background!;
  yield colors.red_dim!;
  yield colors.green_dim!;
  yield colors.yellow_dim!;
  yield colors.blue_dim!;
  yield colors.magenta_dim!;
  yield colors.cyan_dim!;
  yield colors.on_background!;
  yield colors.outline!;
  yield colors.red!;
  yield colors.green!;
  yield colors.yellow!;
  yield colors.blue!;
  yield colors.magenta!;
  yield colors.cyan!;
  yield colors.inverse_surface!;

  const black = oklab(colors.background!);
  const red = oklab(redKey);
  const green = oklab(greenKey);
  const yellow = oklab(yellowKey);
  const blue = oklab(blueKey);
  const magenta = oklab(magentaKey);
  const cyan = oklab(cyanKey);
  const white = oklab(colors.on_background!);
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 6; y++) {
      for (let z = 0; z < 6; z++) {
        const [l, a, b] = (["l", "a", "b"] as const)
          .map((channel) =>
            trilerp(
              black[channel],
              green[channel],
              red[channel],
              yellow[channel],
              blue[channel],
              cyan[channel],
              magenta[channel],
              white[channel],
              x / 5,
              y / 5,
              z / 5,
            )
          ) as [number, number, number];
        yield Palette.from({ mode: "oklab", l, a, b });
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const [l, a, b] = (["l", "a", "b"] as const)
      .map((channel) =>
        lerp(
          black[channel],
          white[channel],
          (i + 1) / 25,
        )
      ) as [number, number, number];
    yield Palette.from({ mode: "oklab", l, a, b });
  }
}().toArray();

if (process.stderr.isTTY) {
  process.stderr.write("\x1b[?7l");
  for (const [name, color] of Object.entries(colors)) {
    color.log("\x1b[0K%s %s \n", color, name);
  }
  for (let i = 0; i < 16; i++) {
    color256[i]!.log("  ");
  }
  process.stderr.write("\n");
  const R = oklab("red")!;
  const G = oklab("green")!;
  const M = oklab("magenta")!;
  const B = oklab("blue")!;
  for (let v = 0; v < 12; v++) {
    color256[232 + v * 2]!.log("  ");
    color256[8]!.log("  ");
    const Y = (["l", "a", "b"] as const).map((channel) =>
      lerp(R[channel], G[channel], v / 11)
    ) as [number, number, number];
    const P = (["l", "a", "b"] as const).map((channel) =>
      lerp(M[channel], B[channel], v / 11)
    ) as [number, number, number];
    for (let u = 0; u < 12; u++) {
      const [l, a, b] = Y.map((_, i) => lerp(Y[i]!, P[i]!, u / 11)) as [
        number,
        number,
        number,
      ];
      const rgb = Palette.from({ mode: "oklab", l, a, b }).toRgb();
      const i = Math.round(rgb.r / 51) * 36 +
        Math.round(rgb.g / 51) * 6 +
        Math.round(rgb.b / 51) + 16;
      color256[i]!.log("  ");
    }
    color256[7]!.log("  ");
    color256[232 + 23 - v * 2]!.log("  ");
    process.stderr.write("\n");
  }
  process.stderr.write("\x1b[?7h");
}

console.log(JSON.stringify({
  ...colors,
  ...Object.fromEntries(color256.map((v, i) => [`color${i}`, v])),
}));
