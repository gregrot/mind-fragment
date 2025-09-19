# Crash-Zone Render Output

Run `tools/render_crash_zone_assets.py` to regenerate the PNGs referenced in
`docs/steering/visual-assets.md`. The script reconstructs the pixel grids defined
in the study and exports 48×48 and 96×96 renders by default.

The tool depends on Pillow. Install it with `pip install pillow` before running
the script.
