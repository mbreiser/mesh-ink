import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

/**
 * Load an SVG file and extract shapes for decal projection.
 * Uses Three.js SVGLoader to parse paths into ShapePath objects.
 */
export class SVGDecalLoader {
  constructor() {
    this.loader = new SVGLoader();
  }

  /**
   * Parse SVG text content into shapes.
   * @param {string} svgText - Raw SVG text
   * @returns {{ shapes: Array<THREE.Shape>, bounds: {x, y, width, height} }}
   */
  parse(svgText) {
    const data = this.loader.parse(svgText);
    const allShapes = [];

    for (const path of data.paths) {
      const shapes = SVGLoader.createShapes(path);
      allShapes.push(...shapes);
    }

    // Compute bounding box of all shapes
    const bounds = this._computeBounds(allShapes);

    return { shapes: allShapes, bounds };
  }

  /**
   * Compute the bounding box of all shapes.
   */
  _computeBounds(shapes) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const shape of shapes) {
      const points = shape.getPoints();
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      if (shape.holes) {
        for (const hole of shape.holes) {
          for (const p of hole.getPoints()) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
        }
      }
    }

    if (shapes.length === 0 || minX === Infinity) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
