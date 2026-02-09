# Claude Code Project Prompt: 3MF SVG Decal Applicator

## Project Name
**mesh-ink** (or whichever repo name you chose)

## One-Line Summary
A web-based tool that lets users open 3MF files, project SVG vector graphics onto mesh surfaces as colored decals, and export the result as a multi-color 3MF file compatible with Bambu Studio.

---

## Project Setup

Initialize a Node.js web application. Use Vite as the build tool for fast development. The app runs entirely in the browser — no server-side processing needed.

```bash
npm create vite@latest mesh-ink -- --template vanilla
cd mesh-ink
npm install
npm install three three-mesh-bvh jszip
```

### Key Dependencies
- **three** (Three.js) — 3D rendering, mesh loading, raycasting
- **three-mesh-bvh** — accelerated raycasting for projecting SVGs onto meshes
- **jszip** — reading and writing 3MF files (which are ZIP archives)
- **opentype.js** — optional, only if we need SVG text-to-path conversion later

---

## Architecture Overview

```
src/
├── main.js                 # App entry point, UI wiring
├── viewer/
│   ├── SceneManager.js     # Three.js scene setup, camera, controls
│   └── MeshRenderer.js     # Renders loaded meshes with per-triangle color
├── formats/
│   ├── ThreeMFReader.js    # Parse 3MF ZIP → internal mesh model
│   ├── ThreeMFWriter.js    # Internal mesh model → 3MF ZIP with materials
│   └── STLReader.js        # (V2) Parse STL → internal mesh model
├── model/
│   ├── MeshModel.js        # Internal representation: vertices, triangles, per-triangle material IDs
│   └── MaterialPalette.js  # Material definitions (colors), manages base + decal colors
├── decal/
│   ├── SVGLoader.js        # Parse SVG file into 2D paths/polygons
│   ├── DecalPlacer.js      # Interactive placement: position, scale on mesh surface
│   └── DecalProjector.js   # Project 2D decal onto mesh, assign triangle materials
├── ui/
│   ├── Toolbar.js          # File open, SVG import, export buttons
│   ├── DecalControls.js    # Scale/position sliders or drag handles
│   └── ColorPicker.js      # Set base color and decal color
└── utils/
    ├── xml.js              # XML parsing/generation helpers for 3MF
    └── geometry.js         # Triangle-point tests, polygon operations
```

---

## Phase 1: Core Foundation

### 1.1 — 3MF File Reader

A 3MF file is a ZIP archive containing:
- `[Content_Types].xml` — MIME type declarations
- `_rels/.rels` — root relationships
- `3D/3dmodel.model` — the main model XML (meshes, materials, build instructions)

The model XML uses namespace `http://schemas.microsoft.com/3dmanufacturing/core/2015/02`.

**Parse the model XML to extract:**
- `<mesh>` elements containing `<vertices>` and `<triangles>`
- Each `<vertex x="..." y="..." z="..."/>`
- Each `<triangle v1="..." v2="..." v3="..." pid="..." p1="..."/>` where `pid` references a material group and `p1` is the material index within that group
- `<basematerials id="...">` containing `<base name="..." displaycolor="#RRGGBBAA"/>` entries

**Internal mesh model should store:**
```javascript
{
  vertices: Float32Array,         // [x0,y0,z0, x1,y1,z1, ...]
  triangles: Uint32Array,         // [v1_0,v2_0,v3_0, v1_1,v2_1,v3_1, ...]
  triangleMaterials: Uint32Array, // material index per triangle
  materials: [                    // palette
    { name: "Base", color: "#FFFFFFFF" },
    { name: "Decal", color: "#FF0000FF" }
  ]
}
```

**Important:** Preserve any Bambu-specific extensions and metadata from the original 3MF so they survive round-tripping. Store the original ZIP entries and only replace `3D/3dmodel.model` on export.

### 1.2 — Three.js Viewer

Set up a Three.js scene with:
- `OrbitControls` for rotate/zoom/pan
- A mesh rendered from the loaded model
- Per-triangle coloring using a vertex color buffer attribute (set all 3 vertices of each triangle to that triangle's material color)
- Ambient + directional lighting
- Grid helper for orientation

The viewer should fill the browser viewport with a toolbar/sidebar overlay.

### 1.3 — 3MF File Writer

Export the internal model back to 3MF:
- Start from the original ZIP contents (to preserve metadata)
- Regenerate `3D/3dmodel.model` with updated mesh data and materials
- Write `<basematerials>` with all colors in the palette
- Write each `<triangle>` with `pid` and `p1` attributes pointing to the correct material
- Package as ZIP and trigger browser download

**Validation:** The output must open correctly in Bambu Studio with distinct colors visible in the slicer's color view.

---

## Phase 2: SVG Decal Projection

### 2.1 — SVG Loading

Load an SVG file and extract filled paths as 2D polygons. For V1, support:
- `<path>` elements with `d` attributes (the most common SVG primitive)
- `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` basic shapes
- Flatten any transforms into the path coordinates

Ignore strokes, gradients, text, filters, and effects for V1. Treat everything as filled regions.

Use Three.js's built-in `SVGLoader` from `three/addons/loaders/SVGLoader.js` — it already handles path parsing and converts to `ShapePath` objects.

### 2.2 — Interactive Decal Placement

The user workflow:
1. Load a 3MF file → model appears in viewer
2. Click "Add SVG Decal" → file picker for SVG
3. SVG appears as a 2D overlay that the user can position on the mesh surface
4. User clicks a point on the mesh to anchor the decal center
5. Decal is projected onto the surface from the camera's viewpoint (or surface normal)
6. User can adjust: **scale** (uniform) and **position** (drag on surface)
7. Preview shows which triangles will be colored

**Projection method (V1 — centroid test):**
- For each triangle in the mesh, project its centroid onto the decal's 2D plane
- Test if the projected 2D point falls inside any of the SVG's filled paths
- If yes, assign that triangle to the decal material

This is simpler than exact boundary subdivision and gives good results especially if the mesh has reasonable triangle density.

### 2.3 — Decal Preview

Before committing, show the user a preview:
- Triangles that will be recolored are highlighted (shown in the decal color or with a semi-transparent overlay)
- The SVG outline is rendered on the mesh surface as a wireframe guide
- User can adjust position/scale and see the preview update in real-time

### 2.4 — Apply and Export

When the user clicks "Apply":
- Update `triangleMaterials` for affected triangles
- Update the vertex color buffer for immediate visual feedback
- User can then add more decals or export

Multiple decals can be applied sequentially. Each application permanently modifies the triangle materials (or we can keep an undo stack for V2).

---

## Phase 3: Polish and UX

### 3.1 — UI Layout

```
┌─────────────────────────────────────────────────────┐
│  [Open 3MF]  [Add SVG]  [Export 3MF]    mesh-ink    │
├───────────────────────────────────────┬─────────────┤
│                                       │ Materials:  │
│                                       │ ■ Base      │
│           3D Viewport                 │ ■ Decal     │
│          (Three.js canvas)            │             │
│                                       │ Decal:      │
│                                       │ Scale: ──●──│
│                                       │ [Apply]     │
│                                       │ [Undo]      │
└───────────────────────────────────────┴─────────────┘
```

### 3.2 — File Handling
- Drag-and-drop support for both 3MF and SVG files
- Remember last used colors in localStorage
- Show triangle count and file info in status bar

### 3.3 — Visual Feedback
- Highlight hovered triangles on mouseover
- Show the projection footprint as the user moves the decal
- Smooth camera transitions

---

## Technical Notes

### 3MF XML Structure Reference

Minimal valid 3MF model XML:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <resources>
    <basematerials id="1">
      <base name="Base" displaycolor="#FFFFFFFF"/>
      <base name="Decal" displaycolor="#FF0000FF"/>
    </basematerials>
    <object id="2" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="10" y="0" z="0"/>
          <vertex x="5" y="10" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="1" p1="0"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="2"/>
  </build>
</model>
```

### Bambu Studio Compatibility Notes
- Bambu Studio reads `<basematerials>` for color assignments
- Per-triangle color uses `pid` (material group ID) and `p1` (index within group)
- `p1` alone is sufficient when all triangles reference the same `<basematerials>` group
- `displaycolor` format is `#RRGGBBAA` (with alpha) or `#RRGGBB`
- Bambu-specific extensions live in custom namespaces — preserve them on round-trip
- When opening in Bambu Studio, user can map each `<base>` material to a filament/AMS slot

### Performance Considerations
- For meshes with >100K triangles, use `three-mesh-bvh` for raycasting
- SVG point-in-polygon tests can be batched (project all centroids, then test)
- Vertex color buffer updates should be partial (only update affected triangles)

### Coordinate System
- 3MF uses millimeters, right-handed coordinate system
- Three.js is also right-handed, but Y-up vs. 3MF which is typically Z-up
- Apply a rotation on import: swap Y and Z, or rotate -90° around X

---

## V1 Acceptance Criteria

1. **Open a 3MF file** downloaded from MakerWorld and see the 3D model rendered with correct colors
2. **Load an SVG file** and see its shapes overlaid on the model
3. **Position and scale** the SVG on the model surface interactively
4. **Preview** which triangles will be recolored
5. **Apply** the decal and see the color change immediately
6. **Export** a valid 3MF file that opens in Bambu Studio with the decal color as a distinct material
7. **Round-trip:** open the exported file back in mesh-ink and see the decal colors preserved

---

## Getting Started (for Claude Code)

Start with Phase 1 in order:
1. First, build the 3MF reader — parse a real 3MF file from MakerWorld and log its structure
2. Then, render the parsed mesh in Three.js with per-triangle colors
3. Then, build the 3MF writer and verify round-trip (open → export → open in Bambu Studio)
4. Only then move to Phase 2 (SVG projection)

For testing, grab a simple multi-color 3MF from MakerWorld (search for "multicolor" or "mmu" models).

Use `npx vite` for the dev server during development.
