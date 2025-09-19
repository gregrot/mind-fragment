#!/usr/bin/env python3
"""Render the crash-zone pixel studies described in docs/steering/visual-assets.md.

The script reconstructs each study from the ASCII grids and legends in the
steering document, then exports nearest-neighbour scaled PNGs. Pillow must be
installed in the environment running this tool.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Mapping, Sequence, Tuple

from PIL import Image


@dataclass(frozen=True)
class AssetDefinition:
    """Container for the ASCII grid and palette legend used by an asset."""

    slug: str
    grid: Sequence[str]
    legend: Mapping[str, Tuple[str | None, float]]


ASSETS: Tuple[AssetDefinition, ...] = (
    AssetDefinition(
        slug="mind-fragment-core",
        grid=(
            "..aaAAaa..",
            ".aBBBBBBa.",
            "ABBBBBBBBA",
            "ABBCDDCBBA",
            "ABBCEEDBBA",
            "ABBCEEDBBA",
            "ABBCDDCBBA",
            "ABBBBBBBBA",
            ".aBBBBBBa.",
            "..aaAAaa..",
        ),
        legend={
            ".": (None, 0.0),
            "A": ("#1F2A44", 1.0),
            "B": ("#3C6BA6", 1.0),
            "C": ("#8D4FD3", 1.0),
            "D": ("#F38B2A", 1.0),
            "E": ("#5A8453", 1.0),
            "a": ("#1F2A44", 0.3),
        },
    ),
    AssetDefinition(
        slug="worker-m0-drone",
        grid=(
            "...AA....",
            "..ABBBA..",
            ".ABCCCBa.",
            "ABCDDDBBA",
            "BBCD1DBCB",
            "ABCDDDBBA",
            ".ABCCCBa.",
            "..ABBBA..",
            "...AA....",
        ),
        legend={
            ".": (None, 0.0),
            "A": ("#1F2A44", 1.0),
            "B": ("#3C6BA6", 1.0),
            "C": ("#8D4FD3", 1.0),
            "D": ("#5A8453", 1.0),
            "a": ("#3C6BA6", 0.4),
            "1": ("#F38B2A", 1.0),
        },
    ),
    AssetDefinition(
        slug="nestled-sporeling",
        grid=(
            "....aaa....",
            "...aBBBaa..",
            "..aBEEEBAa.",
            ".aBEEfEEBa.",
            ".aBEFFFEBa.",
            ".aBEEfEEBa.",
            "..aBEEEBAa.",
            "...aBBBaa..",
            "....aaa....",
        ),
        legend={
            ".": (None, 0.0),
            "A": ("#1F2A44", 1.0),
            "B": ("#5A8453", 1.0),
            "E": ("#8D4FD3", 1.0),
            "F": ("#F38B2A", 0.6),
            "a": ("#1F2A44", 0.25),
            "f": ("#F38B2A", 0.3),
        },
    ),
)

DEFAULT_SIZES: Tuple[int, ...] = (48, 96)
DEFAULT_OUTPUT_DIR = Path("docs/steering/assets/crash-zone")
TRANSPARENT_PIXEL = (0, 0, 0, 0)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate crash-zone PNGs from the ASCII grids recorded in "
            "docs/steering/visual-assets.md."
        )
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=(
            "Directory to store rendered PNGs. Defaults to docs/steering/"
            "assets/crash-zone."
        ),
    )
    parser.add_argument(
        "--sizes",
        type=int,
        nargs="+",
        default=list(DEFAULT_SIZES),
        help="Square resolutions to export (e.g. 48 96).",
    )
    parser.add_argument(
        "--include-base",
        action="store_true",
        help="Also save the unscaled base grids for inspection.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List the files that would be generated without writing them.",
    )
    return parser


def hex_to_rgb(hex_colour: str) -> Tuple[int, int, int]:
    colour = hex_colour.lstrip("#")
    if len(colour) != 6:
        raise ValueError(f"Unsupported colour value: {hex_colour!r}")
    return tuple(int(colour[i : i + 2], 16) for i in (0, 2, 4))


def to_rgba(hex_colour: str | None, opacity: float) -> Tuple[int, int, int, int]:
    if hex_colour is None or opacity <= 0.0:
        return TRANSPARENT_PIXEL
    rgb = hex_to_rgb(hex_colour)
    alpha = int(opacity * 255 + 0.5)
    alpha = max(0, min(alpha, 255))
    return rgb + (alpha,)


def normalise_legend(legend: Mapping[str, Tuple[str | None, float]]) -> Dict[str, Tuple[int, int, int, int]]:
    return {symbol: to_rgba(hex_colour, opacity) for symbol, (hex_colour, opacity) in legend.items()}


def render_asset_grid(asset: AssetDefinition) -> Image.Image:
    legend = normalise_legend(asset.legend)
    base_dimension = max(len(asset.grid), *(len(row) for row in asset.grid))
    canvas = Image.new("RGBA", (base_dimension, base_dimension), TRANSPARENT_PIXEL)

    vertical_offset = (base_dimension - len(asset.grid)) // 2
    for row_index, row in enumerate(asset.grid):
        horizontal_offset = (base_dimension - len(row)) // 2
        for column_index, symbol in enumerate(row):
            try:
                pixel = legend[symbol]
            except KeyError as error:
                available = ", ".join(sorted(legend))
                raise KeyError(
                    f"Symbol {symbol!r} in {asset.slug} is not defined. "
                    f"Known symbols: {available}"
                ) from error
            if pixel == TRANSPARENT_PIXEL:
                continue
            canvas.putpixel(
                (horizontal_offset + column_index, vertical_offset + row_index), pixel
            )
    return canvas


def export_asset(asset: AssetDefinition, sizes: Iterable[int], output_dir: Path, include_base: bool, dry_run: bool) -> None:
    base_image = render_asset_grid(asset)

    if include_base:
        base_name = f"{asset.slug}_base.png"
        base_path = output_dir / base_name
        if dry_run:
            print(f"[dry-run] {base_path}")
        else:
            base_image.save(base_path)
            print(f"Saved {base_path}")

    for size in sorted({size for size in sizes if size > 0}):
        filename = f"{asset.slug}_{size}.png"
        target_path = output_dir / filename
        if dry_run:
            print(f"[dry-run] {target_path}")
            continue
        scaled = base_image.resize((size, size), resample=Image.NEAREST)
        scaled.save(target_path)
        print(f"Saved {target_path}")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    output_dir: Path = args.output_dir
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    for asset in ASSETS:
        export_asset(
            asset=asset,
            sizes=args.sizes,
            output_dir=output_dir,
            include_base=args.include_base,
            dry_run=args.dry_run,
        )


if __name__ == "__main__":
    main()
