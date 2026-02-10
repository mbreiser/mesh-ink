# mesh-ink

A browser-based tool for projecting SVG decals onto 3D meshes and exporting multi-color 3MF files for Bambu Studio.

**Live app: https://mbreiser.github.io/mesh-ink/**

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173/mesh-ink/`).

## How to Test (Step by Step)

### 1. Get a test model

Download a multi-color 3MF file from [MakerWorld](https://makerworld.com) — search for "multicolor" or "mmu" models. Any `.3mf` file will work. Single-color STL files are also supported.

### 2. Load the model

Either:
- Click **Open 3MF** in the toolbar and pick your file, or
- Drag and drop the `.3mf` / `.stl` file onto the viewport

You should see the 3D model rendered with its original colors. Use your mouse to orbit (left-drag), zoom (scroll), and pan (right-drag).

### 3. Add an SVG decal

Either:
- Click **Add SVG** and pick an SVG file, or
- Drag and drop an `.svg` file onto the viewport

A test SVG is included at `test-assets/circles-10x10.svg` (a 10x10 grid of filled circles).

### 4. Place the decal

Click anywhere on the model surface. The decal will be anchored at that point and projected along the surface normal.

### 5. Adjust the decal

Use the sidebar controls:
- **Color** — pick the decal color
- **Scale** — size of the decal on the surface
- **Rotation** — rotate the decal around its anchor
- **Max Depth** — how far from the surface plane to include triangles

The preview updates in real-time — colored triangles show which faces will be affected.

### 6. Apply

Click **Apply** to commit the decal. The triangle materials are permanently updated. You can repeat steps 3-6 to add more decals.

### 7. Export

Click **Export 3MF** to download the result. The exported file preserves any original Bambu Studio metadata and can be opened directly in the slicer.

### 8. Verify round-trip

Open the exported `.3mf` back in mesh-ink to confirm colors are preserved. Open it in Bambu Studio to confirm it slices correctly with distinct materials.

## Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

## Deploy to GitHub Pages

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys to Pages on every push to `main`.

**Setup:** In your repo's Settings > Pages, set the source to **GitHub Actions**.

Once configured, the site will be live at `https://<username>.github.io/mesh-ink/`.

## License

GPL-3.0
