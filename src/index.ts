#!/usr/bin/env bun
import { argv } from "bun";
import { lerp, oklab, trilerp } from "culori";
import { Palette } from "./palette";
import { DynamicScheme } from "./dynamic";

const blendAmount = 0.1;

const source = Palette.convert(argv[2]) ?? Palette.solid(210);

const primaryKey = Palette.key(.071, source.h);
const secondaryKey = Palette.key(.043, source.h);
const tertiaryKey = Palette.key(.071, (source.h ?? 0) + 60);
const neutralKey = Palette.key(.017, source.h);

const redKey = Palette.key(.155, 30).blend(source, blendAmount);
const yellowKey = Palette.key(.155, 90, true).blend(source, blendAmount);
const greenKey = Palette.key(.155, 150, true).blend(source, blendAmount);
const cyanKey = Palette.key(.155, 210, true).blend(source, blendAmount);
const blueKey = Palette.key(.155, 270).blend(source, blendAmount);
const magentaKey = Palette.key(.155, 330).blend(source, blendAmount);

const baseScheme = new DynamicScheme({
  n: neutralKey,
  p: primaryKey,
  e: redKey,
});

const colors: Record<string, Palette> = Object.assign(
  {
    surface: baseScheme.surface,
    surface_dim: baseScheme.surfaceDim,
    surface_bright: baseScheme.surfaceBright,
    surface_container_lowest: baseScheme.surfaceContainerLowest,
    surface_container_low: baseScheme.surfaceContainerLow,
    surface_container: baseScheme.surfaceContainer,
    surface_container_high: baseScheme.surfaceContainerHigh,
    surface_container_highest: baseScheme.surfaceContainerHighest,
    on_surface: baseScheme.onSurface,
    outline: baseScheme.outline,
    outline_variant: baseScheme.outlineVariant,
    inverse_surface: baseScheme.inverseSurface,
    inverse_on_surface: baseScheme.inverseOnSurface,
    shadow: baseScheme.shadow,
    scrim: baseScheme.scrim,
    background: baseScheme.background,
    on_background: baseScheme.onBackground,
    surface_variant: baseScheme.surfaceVariant,
    on_surface_variant: baseScheme.onSurfaceVariant,
    surface_tint: baseScheme.surfaceTint,

    primary: baseScheme.primary,
    primary_dim: baseScheme.primaryDim,
    on_primary: baseScheme.onPrimary,
    primary_container: baseScheme.primaryContainer,
    on_primary_container: baseScheme.onPrimaryContainer,
    inverse_primary: baseScheme.inversePrimary,
    primary_fixed: baseScheme.primaryFixed,
    primary_fixed_dim: baseScheme.primaryFixedDim,
    on_primary_fixed: baseScheme.onPrimaryFixed,
    on_primary_fixed_variant: baseScheme.onPrimaryFixedVariant,

    error: baseScheme.error,
    error_dim: baseScheme.errorDim,
    on_error: baseScheme.onError,
    error_container: baseScheme.errorContainer,
    on_error_container: baseScheme.onErrorContainer,
  },
  ...Object.entries({
    secondary: secondaryKey,
    tertiary: tertiaryKey,
  }).map(([type, key]) => {
    const scheme = new DynamicScheme({
      ...baseScheme,
      p: key,
    });
    return {
      [type]: scheme.primary,
      [`${type}_dim`]: scheme.primaryDim,
      [`on_${type}`]: scheme.onPrimary,
      [`${type}_container`]: scheme.primaryContainer,
      [`on_${type}_container`]: scheme.onPrimaryContainer,
      [`${type}_fixed`]: scheme.primaryFixed,
      [`${type}_fixed_dim`]: scheme.primaryFixedDim,
      [`on_${type}_fixed`]: scheme.onPrimaryFixed,
      [`on_${type}_fixed_variant`]: scheme.onPrimaryFixedVariant,
    };
  }),
  ...Object.entries({
    red: redKey,
    yellow: yellowKey,
    green: greenKey,
    cyan: cyanKey,
    blue: blueKey,
    magenta: magentaKey,
  }).map(([type, key]) => {
    const scheme = new DynamicScheme({
      ...baseScheme,
      e: key,
    });
    return {
      [type]: scheme.error,
      [`${type}_dim`]: scheme.errorDim,
      [`on_${type}`]: scheme.onError,
      [`${type}_container`]: scheme.errorContainer,
      [`on_${type}_container`]: scheme.onErrorContainer,
    };
  }),
);

const color256 = function* () {
  const whiteBright = colors.inverse_surface!.l > colors.on_surface!.l
    ? colors.inverse_surface!
    : colors.on_surface!;

  yield colors.surface!;
  yield colors.red_dim!;
  yield colors.green_dim!;
  yield colors.yellow_dim!;
  yield colors.blue_dim!;
  yield colors.magenta_dim!;
  yield colors.cyan_dim!;
  yield colors.on_surface!;
  yield colors.outline!;
  yield colors.red!;
  yield colors.green!;
  yield colors.yellow!;
  yield colors.blue!;
  yield colors.magenta!;
  yield colors.cyan!;
  yield whiteBright;

  const black = oklab(colors.surface!);
  const red = oklab(redKey);
  const green = oklab(greenKey);
  const yellow = oklab(yellowKey);
  const blue = oklab(blueKey);
  const magenta = oklab(magentaKey);
  const cyan = oklab(cyanKey);
  const white = oklab(whiteBright);
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
