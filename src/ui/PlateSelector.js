/**
 * Modal dialog for selecting a plate from a multi-plate 3MF file.
 */
export class PlateSelector {
  constructor() {
    this._overlay = null;
  }

  /**
   * Show the plate selector and return a Promise that resolves
   * with the selected plate index (0-based), or rejects on cancel.
   * @param {Array<{id: number, name: string, objectIds: string[]}>} plates
   * @returns {Promise<number>}
   */
  show(plates) {
    return new Promise((resolve, reject) => {
      this._remove();

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'modal';

      const title = document.createElement('h2');
      title.textContent = 'Select a Plate';
      modal.appendChild(title);

      const subtitle = document.createElement('p');
      subtitle.className = 'modal-subtitle';
      subtitle.textContent = `This file contains ${plates.length} plates. Choose which plate to load.`;
      modal.appendChild(subtitle);

      const list = document.createElement('div');
      list.className = 'plate-list';

      plates.forEach((plate, index) => {
        const btn = document.createElement('button');
        btn.className = 'plate-button';

        const label = plate.name
          ? `Plate ${plate.id}: ${plate.name}`
          : `Plate ${plate.id || (index + 1)}`;
        const detail = `${plate.objectIds.length} object${plate.objectIds.length !== 1 ? 's' : ''}`;

        btn.innerHTML = `<span class="plate-label">${label}</span><span class="plate-detail">${detail}</span>`;

        btn.addEventListener('click', () => {
          this._remove();
          resolve(index);
        });

        list.appendChild(btn);
      });

      modal.appendChild(list);

      // "Load All" button
      const allBtn = document.createElement('button');
      allBtn.className = 'plate-button plate-button-all';
      allBtn.textContent = 'Load All Plates';
      allBtn.addEventListener('click', () => {
        this._remove();
        resolve(-1); // -1 means load all
      });
      modal.appendChild(allBtn);

      // Cancel
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'plate-button plate-button-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        this._remove();
        reject(new Error('Cancelled'));
      });
      modal.appendChild(cancelBtn);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this._overlay = overlay;
    });
  }

  _remove() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }
}
