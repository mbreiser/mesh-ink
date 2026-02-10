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
    // Rasterize shapes to bitmap for fast O(1) point-in-shape testing
    const bitmap = this._rasterize(allShapes, bounds);

    return { shapes: allShapes, bounds, bitmap };
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

  /**
   * Rasterize SVG shapes to a bitmap for fast point-in-shape testing.
   * Uses Canvas2D for hardware-accelerated rasterization.
   */
  _rasterize(shapes, bounds, resolution = 512) {
    if (bounds.width === 0 || bounds.height === 0) return null;

    // Add margin to avoid edge clipping
    const margin = Math.max(bounds.width, bounds.height) * 0.02;
    const paddedBounds = {
      x: bounds.x - margin,
      y: bounds.y - margin,
      width: bounds.width + margin * 2,
      height: bounds.height + margin * 2,
    };

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');

    const scaleX = resolution / paddedBounds.width;
    const scaleY = resolution / paddedBounds.height;

    ctx.fillStyle = '#ffffff';

    for (const shape of shapes) {
      const points = shape.getPoints(64);
      if (points.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(
        (points[0].x - paddedBounds.x) * scaleX,
        (points[0].y - paddedBounds.y) * scaleY
      );
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(
          (points[i].x - paddedBounds.x) * scaleX,
          (points[i].y - paddedBounds.y) * scaleY
        );
      }
      ctx.closePath();
      ctx.fill();

      // Cut out holes
      if (shape.holes && shape.holes.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        for (const hole of shape.holes) {
          const holePoints = hole.getPoints(64);
          if (holePoints.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(
            (holePoints[0].x - paddedBounds.x) * scaleX,
            (holePoints[0].y - paddedBounds.y) * scaleY
          );
          for (let i = 1; i < holePoints.length; i++) {
            ctx.lineTo(
              (holePoints[i].x - paddedBounds.x) * scaleX,
              (holePoints[i].y - paddedBounds.y) * scaleY
            );
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    const imageData = ctx.getImageData(0, 0, resolution, resolution);

    return {
      data: imageData.data,
      width: resolution,
      height: resolution,
      bounds: paddedBounds,
    };
  }
}
