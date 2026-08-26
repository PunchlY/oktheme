import { Palette } from "./palette";

export class DynamicScheme {
  readonly n: Palette;
  readonly p: Palette;
  readonly e: Palette;
  readonly isDark: boolean;
  constructor(opts: {
    n: Palette;
    p: Palette;
    e: Palette;
    isDark?: boolean;
  }) {
    this.n = opts.n;
    this.p = opts.p;
    this.e = opts.e;
    this.isDark = opts.isDark ?? true;
  }

  get highestSurface() {
    return this.isDark ? this.surfaceBright : this.surfaceDim;
  }

  // Surfaces

  get surface() {
    if (this.isDark) {
      return this.n.tone(.13);
    }
    return this.n.tone(.98);
  }

  get surfaceDim() {
    if (this.isDark) {
      return this.n.tone(.13);
    }
    return this.n.tone(.90, 1.3);
  }

  get surfaceBright() {
    if (this.isDark) {
      return this.n.tone(.3, 1.3);
    }
    return this.n.tone(.98);
  }

  get surfaceContainerLowest() {
    if (this.isDark) {
      return this.n.tone(.0);
    }
    return this.n.tone(1);
  }

  get surfaceContainerLow() {
    if (this.isDark) {
      return this.n.tone(.07, 1.1);
    }
    return this.n.tone(.96, 1.1);
  }

  get surfaceContainer() {
    if (this.isDark) {
      return this.n.tone(.14, 1.167);
    }
    return this.n.tone(.94, 1.167);
  }

  get surfaceContainerHigh() {
    if (this.isDark) {
      return this.n.tone(.21, 1.233);
    }
    return this.n.tone(.92, 1.233);
  }

  get surfaceContainerHighest() {
    if (this.isDark) {
      return this.n.tone(.28, 1.3);
    }
    return this.n.tone(.9, 1.3);
  }

  get onSurface() {
    return this.highestSurface.foreground(75);
  }

  get outline() {
    return this.highestSurface.foreground(30);
  }

  get outlineVariant() {
    return this.highestSurface.foreground(15);
  }

  get inverseSurface() {
    return new DynamicScheme({
      ...this,
      isDark: !this.isDark,
    }).surface;
  }

  get inverseOnSurface() {
    return this.inverseSurface.foreground(60);
  }

  get shadow() {
    return this.n.tone(.0);
  }

  get scrim() {
    return this.n.tone(.0);
  }

  get background() {
    return this.surface;
  }

  get onBackground() {
    return this.onSurface;
  }

  get surfaceVariant() {
    return this.surfaceContainerHighest;
  }

  get onSurfaceVariant() {
    return this.surfaceVariant.foreground(60);
  }

  get surfaceTint() {
    return this.primary;
  }

  get primary() {
    return this.highestSurface.foreground(45, this.p);
  }

  get primaryDim() {
    return this.primary.searchApcaContrast(15);
  }

  get onPrimary() {
    return this.primaryDim.foreground(60);
  }

  get primaryContainer() {
    return this.highestSurface.foreground(15, this.p);
  }

  get onPrimaryContainer() {
    return this.primaryContainer.foreground(60);
  }

  get primaryFixed() {
    return this.highestSurface.foreground(
      15,
      this.p,
      new DynamicScheme({
        ...this,
        isDark: false,
      }).primaryContainer.l,
    );
  }

  get primaryFixedDim() {
    return this.primaryFixed.searchApcaContrast(15);
  }

  get onPrimaryFixed() {
    return this.primaryFixedDim.foreground(60);
  }

  get onPrimaryFixedVariant() {
    return this.primaryFixedDim.foreground(45);
  }

  get inversePrimary() {
    const dark = this.p.dark();
    const light = this.p.light();
    return this.highestSurface.maxContrast(
      this.highestSurface.foreground(60, this.p, dark.l, light.l),
      dark,
      light,
    );
  }

  get error() {
    return this.highestSurface.foreground(
      45,
      this.e,
      this.e.dark().l,
      this.e.light().l,
    );
  }

  get errorDim() {
    return this.error.searchApcaContrast(
      15,
      undefined,
      this.e.dark().l,
    );
  }

  get onError() {
    return this.error.foreground(60);
  }

  get errorContainer() {
    const color = this.highestSurface.foreground(
      15,
      this.e,
      this.e.dark().l,
      this.e.light().l,
    );
    return this.errorDim.maxContrast(
      color,
      this.isDark
        ? this.errorDim.searchApcaContrast(15, this.e, undefined, color.l)
        : this.errorDim.searchApcaContrast(-15, this.e, color.l, undefined),
    );
  }

  get onErrorContainer() {
    return this.errorContainer.foreground(60);
  }
}
