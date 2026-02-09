/**
 * Manages a list of materials (colors) used by the mesh.
 * Each material has a name and a color string (#RRGGBB or #RRGGBBAA).
 */
export class MaterialPalette {
  constructor() {
    this.materials = [];
  }

  addMaterial(name, color) {
    const index = this.materials.length;
    this.materials.push({ name, color });
    return index;
  }

  getMaterial(index) {
    return this.materials[index];
  }

  getColor(index) {
    if (index < 0 || index >= this.materials.length) return '#CCCCCC';
    return this.materials[index].color;
  }

  get count() {
    return this.materials.length;
  }

  /**
   * Parse a #RRGGBB or #RRGGBBAA color string to {r, g, b} in 0-1 range.
   */
  static parseColor(colorStr) {
    const hex = colorStr.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return { r, g, b };
  }

  clone() {
    const p = new MaterialPalette();
    for (const m of this.materials) {
      p.addMaterial(m.name, m.color);
    }
    return p;
  }
}
