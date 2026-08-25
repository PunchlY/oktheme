{
  description = "Bun2Nix minimal sample";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";

    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake {inherit inputs;} ({lib, ...}: {
      imports = [
        inputs.treefmt-nix.flakeModule
      ];
      systems = lib.systems.flakeExposed;
      perSystem = {
        system,
        pkgs,
        ...
      }: {
        _module.args.pkgs = import inputs.nixpkgs {
          inherit system;
          overlays = [
            inputs.bun2nix.overlays.default
          ];
        };

        packages.default = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "oktheme";
          version = "1.0.0";

          src = ./.;

          nativeBuildInputs = [
            pkgs.bun2nix.hook
          ];
          buildInputs = [pkgs.bun];

          bunDeps = pkgs.bun2nix.fetchBunDeps {
            bunNix = ./bun.nix;
          };

          bunBuildFlags = [
            "src/index.ts"
            "--outfile"
            finalAttrs.pname
            "--target=bun"
            "--minify"
          ];
        });

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bashInteractive
            bun
            bun2nix
            imagemagick
          ];

          shellHook = ''
            bun install --frozen-lockfile
          '';
        };

        treefmt = {
          projectRootFile = "flake.nix";

          programs.deadnix = {
            enable = true;
            priority = 1;
          };
          programs.alejandra = {
            enable = true;
            priority = 2;
          };

          programs.deno.enable = true;
        };
      };
    });
}
