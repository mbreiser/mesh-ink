/**
 * Top toolbar with file operations.
 */
export class Toolbar {
  constructor(container) {
    this.element = document.createElement('div');
    this.element.className = 'toolbar';
    container.appendChild(this.element);

    this.callbacks = {};
  }

  init() {
    this.element.innerHTML = `
      <div class="toolbar-left">
        <button id="btn-open" title="Open 3MF or STL file">Open 3MF</button>
        <button id="btn-add-svg" title="Add SVG decal" disabled>Add SVG</button>
        <button id="btn-export" title="Export as 3MF" disabled>Export 3MF</button>
      </div>
      <div class="toolbar-center">
        <span class="app-title">mesh-ink</span>
      </div>
      <div class="toolbar-right">
        <span id="status-text" class="status-text"></span>
      </div>
    `;

    // Hidden file inputs
    this._createFileInput('file-input-3mf', '.3mf,.stl', (file) => this._emit('open', file));
    this._createFileInput('file-input-svg', '.svg', (file) => this._emit('addSvg', file));

    this.element.querySelector('#btn-open').addEventListener('click', () => {
      document.getElementById('file-input-3mf').click();
    });

    this.element.querySelector('#btn-add-svg').addEventListener('click', () => {
      document.getElementById('file-input-svg').click();
    });

    this.element.querySelector('#btn-export').addEventListener('click', () => {
      this._emit('export');
    });
  }

  _createFileInput(id, accept, onChange) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = id;
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        onChange(e.target.files[0]);
        e.target.value = ''; // Reset so same file can be re-selected
      }
    });
    document.body.appendChild(input);
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  _emit(event, ...args) {
    if (this.callbacks[event]) {
      this.callbacks[event](...args);
    }
  }

  enableModelButtons() {
    this.element.querySelector('#btn-add-svg').disabled = false;
    this.element.querySelector('#btn-export').disabled = false;
  }

  setStatus(text) {
    this.element.querySelector('#status-text').textContent = text;
  }
}
