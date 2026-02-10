import { SceneManager } from './viewer/SceneManager.js';
import { MeshRenderer } from './viewer/MeshRenderer.js';
import { ThreeMFReader } from './formats/ThreeMFReader.js';
import { ThreeMFWriter } from './formats/ThreeMFWriter.js';
import { STLReader } from './formats/STLReader.js';
import JSZip from 'jszip';
import { SVGDecalLoader } from './decal/SVGDecalLoader.js';
import { DecalPlacer } from './decal/DecalPlacer.js';
import { DecalProjector } from './decal/DecalProjector.js';
import { Toolbar } from './ui/Toolbar.js';
import { DecalControls } from './ui/DecalControls.js';
import { PlateSelector } from './ui/PlateSelector.js';

class App {
  constructor() {
    // State
    this.model = null;
    this.zip = null;
    this.modelPath = null;
    this.svgData = null;        // { shapes, bounds }
    this.previewTriangles = null;
    this._previewTimer = null;

    // 3D
    this.sceneManager = null;
    this.meshRenderer = null;

    // Decal
    this.decalLoader = new SVGDecalLoader();
    this.decalPlacer = new DecalPlacer();
    this.decalProjector = new DecalProjector();

    // I/O
    this.threeMFReader = new ThreeMFReader();
    this.threeMFWriter = new ThreeMFWriter();
    this.stlReader = new STLReader();

    // UI
    this.toolbar = null;
    this.controls = null;
    this.plateSelector = new PlateSelector();
  }

  init() {
    const viewport = document.getElementById('viewport');
    const toolbarContainer = document.getElementById('toolbar-container');
    const sidebarContainer = document.getElementById('sidebar-container');

    // Scene
    this.sceneManager = new SceneManager(viewport);
    this.meshRenderer = new MeshRenderer(this.sceneManager.scene);

    // Toolbar
    this.toolbar = new Toolbar(toolbarContainer);
    this.toolbar.init();
    this.toolbar.on('open', (file) => this._handleOpenFile(file));
    this.toolbar.on('addSvg', (file) => this._handleAddSvg(file));
    this.toolbar.on('export', () => this._handleExport());

    // Sidebar
    this.controls = new DecalControls(sidebarContainer);
    this.controls.init();
    this.controls.on('scaleChange', (val) => this._handleDecalParamChange());
    this.controls.on('rotationChange', (val) => this._handleDecalParamChange());
    this.controls.on('depthChange', (val) => this._handleDecalParamChange());
    this.controls.on('colorChange', (val) => this._handleDecalParamChange());
    this.controls.on('apply', () => this._handleApplyDecal());
    this.controls.on('cancel', () => this._handleCancelDecal());

    // Click handler for decal placement
    this.sceneManager.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));

    // Drag and drop
    this._setupDragDrop(viewport);

    this.toolbar.setStatus('Ready — open a 3MF or STL file');
  }

  // --- File Handling ---

  async _handleOpenFile(file) {
    try {
      this.toolbar.setStatus(`Loading ${file.name}...`);
      const buffer = await file.arrayBuffer();

      if (file.name.toLowerCase().endsWith('.stl')) {
        this.model = this.stlReader.read(buffer);
        this.zip = null;
        this.modelPath = null;
      } else {
        const result = await this.threeMFReader.read(buffer);

        // Multi-plate file — show plate selector
        if (!result.model && result.plates && result.plates.length > 1) {
          this.toolbar.setStatus(`Found ${result.plates.length} plates — select one`);
          try {
            const plateIndex = await this.plateSelector.show(result.plates);
            const plateResult = plateIndex === -1
              ? this.threeMFReader.readPlate(0) // "Load All" — load first plate for now
              : this.threeMFReader.readPlate(plateIndex);
            this.model = plateResult.model;
            this.zip = plateResult.zip;
            this.modelPath = plateResult.modelPath;
          } catch (e) {
            // User cancelled
            this.toolbar.setStatus('Cancelled');
            return;
          }
        } else {
          this.model = result.model;
          this.zip = result.zip;
          this.modelPath = result.modelPath;
        }
      }

      this._showModel();
    } catch (err) {
      console.error('Error loading file:', err);
      this.toolbar.setStatus(`Error: ${err.message}`);
    }
  }

  _showModel() {
    this.meshRenderer.setModel(this.model);
    this.sceneManager.fitToObject(this.meshRenderer.meshGroup);
    this.toolbar.enableModelButtons();
    this.controls.updateMaterials(this.model.palette);
    this.controls.updateModelInfo(this.model);
    // Auto-configure decal sliders based on model size
    this.controls.configureForModel(this.model.getBoundingSize());
    this.toolbar.setStatus(`Loaded: ${this.model.triangleCount.toLocaleString()} triangles`);
  }

  async _handleAddSvg(file) {
    try {
      this.toolbar.setStatus(`Loading SVG: ${file.name}...`);
      const text = await file.text();
      this.svgData = this.decalLoader.parse(text);
      this.decalPlacer = new DecalPlacer(); // Reset placer
      this.controls.showDecalControls();
      this.toolbar.setStatus(`SVG: ${this.svgData.shapes.length} shapes — click on model to place`);
    } catch (err) {
      console.error('Error loading SVG:', err);
      this.toolbar.setStatus(`Error: ${err.message}`);
    }
  }

  async _handleExport() {
    if (!this.model) return;

    try {
      this.toolbar.setStatus('Exporting 3MF...');

      // If we don't have an original ZIP (e.g., imported from STL), create a minimal one
      const zip = this.zip || (await this._createMinimalZip());
      const modelPath = this.modelPath || '3D/3dmodel.model';

      const blob = await this.threeMFWriter.write(this.model, zip, modelPath);

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mesh-ink-export.3mf';
      a.click();
      URL.revokeObjectURL(url);

      this.toolbar.setStatus('Exported successfully');
    } catch (err) {
      console.error('Error exporting:', err);
      this.toolbar.setStatus(`Export error: ${err.message}`);
    }
  }

  _createMinimalZip() {
    return new JSZip();
  }

  // --- Decal Placement ---

  _handleCanvasClick(e) {
    if (!this.svgData || !this.controls.isDecalActive) return;
    if (!this.meshRenderer.threeMesh) return;

    const ndc = this.sceneManager.getNDC(e);
    const intersections = this.sceneManager.raycast(ndc.x, ndc.y, [this.meshRenderer.threeMesh]);

    if (intersections.length > 0) {
      const hit = intersections[0];
      this.decalPlacer.setAnchor(hit.point, hit.face.normal);
      this.decalPlacer.scale = this.controls.decalScale;
      this.decalPlacer.rotation = this.controls.decalRotation;
      this._updateDecalPreview();
      this.controls.enableApply();
    }
  }

  _handleDecalParamChange() {
    if (!this.decalPlacer.active) return;
    this.decalPlacer.scale = this.controls.decalScale;
    this.decalPlacer.rotation = this.controls.decalRotation;
    // Debounce: wait 150ms after last slider change before recomputing
    this._schedulePreviewUpdate();
  }

  _schedulePreviewUpdate() {
    if (this._previewTimer) clearTimeout(this._previewTimer);
    this.toolbar.setStatus('Updating preview...');
    this._previewTimer = setTimeout(() => {
      this._previewTimer = null;
      this._updateDecalPreview();
    }, 150);
  }

  _updateDecalPreview() {
    if (!this.model || !this.svgData || !this.decalPlacer.active) return;

    // Restore original colors first
    this.meshRenderer.updateColors();

    const projection = this.decalPlacer.getProjection(this.svgData.bounds);
    if (!projection) return;

    const t0 = performance.now();
    const hitTris = this.decalProjector.project(
      this.model,
      this.svgData.bitmap,
      projection,
      this.controls.decalDepth
    );
    const elapsed = Math.round(performance.now() - t0);

    this.previewTriangles = hitTris;

    // Show preview: colored triangles + SVG outline on mesh
    const color = this.controls.decalColor;
    this.meshRenderer.previewTriangles(hitTris, color);
    this.meshRenderer.showDecalOutline(this.svgData.shapes, projection);

    this.toolbar.setStatus(`Preview: ${hitTris.size} triangles (${elapsed}ms)`);
  }

  _handleApplyDecal() {
    if (!this.previewTriangles || this.previewTriangles.size === 0) return;

    const color = this.controls.decalColor;

    // Add or find the decal material in the palette
    let matIndex = -1;
    let isNew = false;
    for (let i = 0; i < this.model.palette.count; i++) {
      if (this.model.palette.getColor(i).toLowerCase() === color.toLowerCase()) {
        matIndex = i;
        break;
      }
    }
    if (matIndex === -1) {
      matIndex = this.model.palette.addMaterial('Decal', color);
      isNew = true;
    }

    // Apply
    this.decalProjector.apply(this.model, this.previewTriangles, matIndex);
    this.meshRenderer.updateColors();
    this.controls.updateMaterials(this.model.palette);

    const count = this.previewTriangles.size;
    // Reset decal state
    this.previewTriangles = null;
    this.svgData = null;
    this.meshRenderer.removeDecalOutline();
    this.controls.hideDecalControls();
    this.toolbar.setStatus(`Decal applied: ${count} triangles (${isNew ? 'new' : 'existing'} material)`);
  }

  _handleCancelDecal() {
    // Restore colors and hide controls
    if (this.model) {
      this.meshRenderer.updateColors();
    }
    this.previewTriangles = null;
    this.svgData = null;
    this.meshRenderer.removeDecalOutline();
    this.controls.hideDecalControls();
    this.toolbar.setStatus('Decal cancelled');
  }

  // --- Drag and Drop ---

  _setupDragDrop(element) {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === '3mf' || ext === 'stl') {
        this._handleOpenFile(file);
      } else if (ext === 'svg') {
        if (this.model) {
          this._handleAddSvg(file);
        } else {
          this.toolbar.setStatus('Load a 3MF/STL model first');
        }
      }
    });
  }
}

// Boot
const app = new App();
app.init();
