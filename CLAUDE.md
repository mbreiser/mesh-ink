# CLAUDE.md — Instructions for Claude Code

## Project
mesh-ink: A web app for projecting SVG decals onto 3D meshes and exporting multi-color 3MF files for Bambu Studio.

## Stack
- **Build:** Vite + vanilla JS (no framework)
- **3D:** Three.js + three-mesh-bvh for accelerated raycasting
- **File I/O:** JSZip for 3MF (ZIP) reading/writing, DOMParser for XML
- **SVG:** Three.js SVGLoader (`three/addons/loaders/SVGLoader.js`)

## Key Commands
- `npm run dev` — start dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Architecture
- `src/formats/` — 3MF and STL file parsers/writers
- `src/model/` — Internal mesh representation with per-triangle material IDs
- `src/viewer/` — Three.js scene, camera, rendering
- `src/decal/` — SVG loading, interactive placement, projection onto mesh
- `src/ui/` — Toolbar, controls, color picker

## Design Decisions
- 3MF is the primary format (in and out). STL import is secondary.
- Per-triangle coloring via centroid projection (not exact boundary subdivision).
- Preserve all original 3MF metadata/extensions for Bambu Studio compatibility.
- Browser-only, no server — all processing client-side.
- V1 supports 2 colors: base + decal. Multi-decal = multiple sequential applications.

## 3MF Notes
- 3MF files are ZIP archives. Main model XML is at `3D/3dmodel.model`.
- Materials in `<basematerials>`, per-triangle assignment via `pid`/`p1` attributes.
- Bambu extensions use custom XML namespaces — always preserve on round-trip.
- Color format: `#RRGGBBAA` or `#RRGGBB`.
- Coordinate system: millimeters, may need Y/Z swap for Three.js.

## Testing
- Validate 3MF round-trip: open in mesh-ink → export → open in Bambu Studio.
- Test with multi-color models from MakerWorld.
- Check that exported files preserve original Bambu metadata.

## Full Project Spec
See `CLAUDE_CODE_PROMPT.md` for the complete phased implementation plan.
