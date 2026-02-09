import * as THREE from 'three';

/**
 * Test if a 2D point is inside a polygon using ray casting.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x: number, y: number}>} polygon - Array of 2D points
 * @returns {boolean}
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Test if a 2D point is inside any of the given ShapePath shapes
 * using Three.js ShapeUtils for triangulated testing.
 * @param {number} px
 * @param {number} py
 * @param {Array<THREE.Shape>} shapes
 * @returns {boolean}
 */
export function pointInShapes(px, py, shapes) {
  const point = new THREE.Vector2(px, py);
  for (const shape of shapes) {
    if (isPointInShape(point, shape)) {
      // Check if point is in a hole
      let inHole = false;
      if (shape.holes) {
        for (const hole of shape.holes) {
          if (isPointInPath(point, hole.getPoints())) {
            inHole = true;
            break;
          }
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function isPointInShape(point, shape) {
  const points = shape.getPoints();
  return isPointInPath(point, points);
}

function isPointInPath(point, pathPoints) {
  let inside = false;
  for (let i = 0, j = pathPoints.length - 1; i < pathPoints.length; j = i++) {
    const xi = pathPoints[i].x, yi = pathPoints[i].y;
    const xj = pathPoints[j].x, yj = pathPoints[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute the normal of a triangle given three vertices.
 */
export function triangleNormal(v1, v2, v3) {
  const edge1 = new THREE.Vector3().subVectors(v2, v1);
  const edge2 = new THREE.Vector3().subVectors(v3, v1);
  return new THREE.Vector3().crossVectors(edge1, edge2).normalize();
}
