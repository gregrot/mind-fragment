# Visual Asset Studies — Crash Zone Set

These studies capture the opening crash-zone visuals we need for early prototypes. Each motif is designed to scale from rough block-outs to eventual production art without losing the Mind Fragment feel.

## Palette Overview
- **Carry-over:** Keep the cooled-metal blues and ember oranges from the original prototype’s HUD for continuity with existing narrative beats.
- **New Work:** Introduce muted violets and moss greens to emphasise alien twilight and the gentle ethical tension around disturbing local life.

| Swatch | Hex | Usage |
| --- | --- | --- |
| ![#1f2a44](https://via.placeholder.com/16/1f2a44/1f2a44.png) | `#1F2A44` | Night-sky shadows, chassis recesses. |
| ![#3c6ba6](https://via.placeholder.com/16/3c6ba6/3c6ba6.png) | `#3C6BA6` | Powered plating highlights. |
| ![#f38b2a](https://via.placeholder.com/16/f38b2a/f38b2a.png) | `#F38B2A` | Ember core glow, warning trims. |
| ![#8d4fd3](https://via.placeholder.com/16/8d4fd3/8d4fd3.png) | `#8D4FD3` | Exotic energy veins. |
| ![#5a8453](https://via.placeholder.com/16/5a8453/5a8453.png) | `#5A8453` | Local flora, nest cushioning. |

> **Call-out — Workflow**
> Use these values as the base palette in Figma or Aseprite. When building pixel or vector passes, stick to this quintet and use luminosity shifts rather than new hues to keep the crash zone cohesive.

## Asset 1 — Mind Fragment Core (Crash Resting State)
- **Carry-over:** Retains the fractured plating silhouette and asymmetric ember glow from the legacy splash art.
- **Purpose:** Serves as the player avatar on the world map and in UI call-outs. Needs to read clearly at 48×48 and 96×96.
- **Shape Notes:** Weighted heavily on the left to imply imminent slide; exposed conduits on the right hint at vulnerability.

> **Export Reminder** — Run `python tools/render_crash_zone_assets.py` to rebuild
> `docs/steering/assets/crash-zone/mind-fragment-core_48.png` and
> `_96.png` variants.

```
..aaAAaa..
.aBBBBBBa.
ABBBBBBBBA
ABBCDDCBBA
ABBCEEDBBA
ABBCEEDBBA
ABBCDDCBBA
ABBBBBBBBA
.aBBBBBBa.
..aaAAaa..
```

Legend: `A=#1F2A44`, `B=#3C6BA6`, `C=#8D4FD3`, `D=#F38B2A`, `E=#5A8453`, `a` is 30% opacity of `#1F2A44` for rim glow.

### Animation Hooks
- Idle shimmer: pulse the `D` pixels on a 2-second sine curve.
- Damage feedback: briefly invert `B` to `D` and desaturate `C` when integrity drops.

## Asset 2 — Worker-M0 Drone (First Craftable Chassis)
- **New Work:** Built to match the revised block-programming-first onboarding; previous drone art was too busy for quick reads.
- **Purpose:** Appears as both an in-world unit and a HUD portrait. Requires clear module slots for tutorial overlays.
- **Silhouette Beats:** Wide stance, low profile; forward sensor “beak” communicates curiosity.

> **Export Reminder** — The render script will output
> `worker-m0-drone_48.png` and `_96.png` under
> `docs/steering/assets/crash-zone/`.

```
...AA....
..ABBBA..
.ABCCCBa.
ABCDDDBBA
BBCD1DBCB
ABCDDDBBA
.ABCCCBa.
..ABBBA..
...AA....
```

Legend: `A=#1F2A44`, `B=#3C6BA6`, `C=#8D4FD3`, `D=#5A8453`, `1=#F38B2A` (core eye), `a` is 40% opacity of `#3C6BA6` for soft limb light.

### Module Call-outs
1. **Motor Mounts:** Outer `B` pads — swap palette accent to indicate upgraded mobility modules.
2. **Scanner Array:** `1` pixel — animate with a rotating triangle mask to show sweep.
3. **Manipulator Hardpoint:** Lower `C` strip — brightens when carrying resources.

## Asset 3 — Nestled Sporeling (Local Fauna Home)
- **New Work:** Visual language for the ethical-choice encounters; must look delicate yet bioluminescent.
- **Purpose:** Environmental prop that reacts to player programming decisions (disturb vs. protect).
- **Lighting:** Soft moss bed with an internal lavender glow.

> **Export Reminder** — Use the render script to regenerate
> `nestled-sporeling_48.png` and `_96.png` in
> `docs/steering/assets/crash-zone/`.

```
....aaa....
...aBBBaa..
..aBEEEBAa.
.aBEEfEEBa.
.aBEFFFEBa.
.aBEEfEEBa.
..aBEEEBAa.
...aBBBaa..
....aaa....
```

Legend: `A=#1F2A44` anchor roots, `B=#5A8453`, `E=#8D4FD3`, `F=#F38B2A` at 60% opacity for pulsating spores, `f` is 30% opacity of `#F38B2A`, `a` is 25% opacity of `#1F2A44` for soft shading.

### Interaction Notes
- When robots disturb the nest, increase the intensity of `F` pixels and add particle motes drifting upward.
- Protective programmes dim `F` and expand the `E` region by one pixel to show growth.

## Implementation Checklist
- Run `python tools/render_crash_zone_assets.py` to export 48×48 and 96×96 PNGs
  with nearest-neighbour scaling so the studies stay crisp.
- Store the generated files under `docs/steering/assets/crash-zone/` so future
  updates stay discoverable from this study.
- Bundle palette swatches as a shared ASE/ACO file for cross-tool consistency.
- Document animation timings alongside block-programming tutorials so art and
  logic stay in sync.

## Rendering Automation

The crash-zone render script at `tools/render_crash_zone_assets.py` rebuilds the
pixel studies directly from these grids. Install Pillow (`pip install pillow`)
and run:

```bash
python tools/render_crash_zone_assets.py
```

Use `--dry-run` to inspect the output paths, `--sizes` to request additional
square resolutions, and `--include-base` if you need the unscaled grids for
reference.
