/**
 * Sidebar controls for decal placement and material colors.
 */
export class DecalControls {
  constructor(container) {
    this.element = document.createElement('div');
    this.element.className = 'sidebar';
    container.appendChild(this.element);

    this.callbacks = {};
    this._decalActive = false;
  }

  init() {
    this.element.innerHTML = `
      <div class="sidebar-section">
        <h3>Materials</h3>
        <div id="material-list" class="material-list"></div>
      </div>
      <div class="sidebar-section" id="decal-section" style="display:none">
        <h3>Decal</h3>
        <div class="control-row">
          <label>Color</label>
          <input type="color" id="decal-color" value="#FF0000">
        </div>
        <div class="control-row">
          <label>Scale</label>
          <input type="range" id="decal-scale" min="1" max="200" value="20">
          <span id="decal-scale-value">20</span>
        </div>
        <div class="control-row">
          <label>Rotation</label>
          <input type="range" id="decal-rotation" min="0" max="360" value="0">
          <span id="decal-rotation-value">0°</span>
        </div>
        <div class="control-row">
          <label>Depth</label>
          <input type="range" id="decal-depth" min="0.5" max="50" value="5" step="0.5">
          <span id="decal-depth-value">5</span>
        </div>
        <p class="hint" id="decal-hint">Click on the model to place the decal</p>
        <div class="button-row">
          <button id="btn-apply-decal" disabled>Apply</button>
          <button id="btn-cancel-decal">Cancel</button>
        </div>
      </div>
      <div class="sidebar-section">
        <h3>Info</h3>
        <div id="model-info" class="model-info">No model loaded</div>
      </div>
    `;

    // Scale slider
    const scaleSlider = this.element.querySelector('#decal-scale');
    scaleSlider.addEventListener('input', () => {
      this.element.querySelector('#decal-scale-value').textContent = scaleSlider.value;
      this._emit('scaleChange', parseFloat(scaleSlider.value));
    });

    // Rotation slider
    const rotSlider = this.element.querySelector('#decal-rotation');
    rotSlider.addEventListener('input', () => {
      this.element.querySelector('#decal-rotation-value').textContent = rotSlider.value + '°';
      this._emit('rotationChange', parseFloat(rotSlider.value) * Math.PI / 180);
    });

    // Depth slider
    const depthSlider = this.element.querySelector('#decal-depth');
    depthSlider.addEventListener('input', () => {
      this.element.querySelector('#decal-depth-value').textContent = depthSlider.value;
      this._emit('depthChange', parseFloat(depthSlider.value));
    });

    // Color picker
    this.element.querySelector('#decal-color').addEventListener('input', (e) => {
      this._emit('colorChange', e.target.value);
    });

    // Buttons
    this.element.querySelector('#btn-apply-decal').addEventListener('click', () => {
      this._emit('apply');
    });

    this.element.querySelector('#btn-cancel-decal').addEventListener('click', () => {
      this._emit('cancel');
    });
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  _emit(event, ...args) {
    if (this.callbacks[event]) this.callbacks[event](...args);
  }

  showDecalControls() {
    this.element.querySelector('#decal-section').style.display = '';
    this._decalActive = true;
  }

  hideDecalControls() {
    this.element.querySelector('#decal-section').style.display = 'none';
    this.element.querySelector('#btn-apply-decal').disabled = true;
    this._decalActive = false;
  }

  enableApply() {
    this.element.querySelector('#btn-apply-decal').disabled = false;
    this.element.querySelector('#decal-hint').textContent = 'Adjust scale/rotation, then Apply';
  }

  /**
   * Set scale/depth slider ranges based on model bounding size.
   */
  configureForModel(modelSize) {
    const scaleSlider = this.element.querySelector('#decal-scale');
    const depthSlider = this.element.querySelector('#decal-depth');

    // Scale range: 1 to 2x model size, default ~15% of model size
    const defaultScale = Math.max(1, Math.round(modelSize * 0.15));
    const maxScale = Math.max(10, Math.round(modelSize * 2));
    scaleSlider.min = 1;
    scaleSlider.max = maxScale;
    scaleSlider.value = defaultScale;
    this.element.querySelector('#decal-scale-value').textContent = defaultScale;

    // Depth range: 0.5 to half model size, default ~5% of model
    const defaultDepth = Math.max(1, Math.round(modelSize * 0.05));
    const maxDepth = Math.max(5, Math.round(modelSize * 0.5));
    depthSlider.min = 0.5;
    depthSlider.max = maxDepth;
    depthSlider.value = defaultDepth;
    depthSlider.step = 0.5;
    this.element.querySelector('#decal-depth-value').textContent = defaultDepth;
  }

  get isDecalActive() {
    return this._decalActive;
  }

  get decalColor() {
    return this.element.querySelector('#decal-color').value;
  }

  get decalScale() {
    return parseFloat(this.element.querySelector('#decal-scale').value);
  }

  get decalRotation() {
    return parseFloat(this.element.querySelector('#decal-rotation').value) * Math.PI / 180;
  }

  get decalDepth() {
    return parseFloat(this.element.querySelector('#decal-depth').value);
  }

  /**
   * Update the material list display.
   * @param {import('../model/MaterialPalette.js').MaterialPalette} palette
   */
  updateMaterials(palette) {
    const list = this.element.querySelector('#material-list');
    list.innerHTML = '';
    for (let i = 0; i < palette.count; i++) {
      const mat = palette.getMaterial(i);
      const { r, g, b } = MaterialPaletteParseColor(mat.color);
      const div = document.createElement('div');
      div.className = 'material-item';
      div.innerHTML = `<span class="color-swatch" style="background:rgb(${r * 255},${g * 255},${b * 255})"></span> ${mat.name}`;
      list.appendChild(div);
    }
  }

  /**
   * Update model info display.
   */
  updateModelInfo(model) {
    const info = this.element.querySelector('#model-info');
    info.textContent = `${model.vertexCount.toLocaleString()} vertices, ${model.triangleCount.toLocaleString()} triangles`;
  }
}

// Inline helper to avoid circular imports
function MaterialPaletteParseColor(colorStr) {
  const hex = colorStr.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return { r, g, b };
}
