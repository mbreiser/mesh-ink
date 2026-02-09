import * as THREE from 'three';
import { pointInShapes } from '../utils/geometry.js';

/**
 * Projects a 2D SVG decal onto a 3D mesh using centroid testing.
 * For each triangle, projects its centroid onto the decal plane
 * and tests if it falls inside the SVG shapes.
 */
export class DecalProjector {
  /**
   * Find which triangles are covered by the decal.
   *
   * @param {import('../model/MeshModel.js').MeshModel} model
   * @param {Array<THREE.Shape>} shapes - SVG shapes
   * @param {{ inverseTransform: Function }} projection - From DecalPlacer
   * @param {number} maxDistance - Max distance from decal plane to consider
   * @returns {Set<number>} Set of triangle indices that are "hit"
   */
  project(model, shapes, projection, maxDistance = Infinity) {
    const hitTriangles = new Set();
    const { inverseTransform, projectionBasis } = projection;

    for (let t = 0; t < model.triangleCount; t++) {
      const centroid = model.getTriangleCentroid(t);
      const centroid3D = new THREE.Vector3(centroid.x, centroid.y, centroid.z);

      // Check distance from the decal plane
      if (maxDistance < Infinity) {
        const diff = new THREE.Vector3().subVectors(centroid3D, projectionBasis.origin);
        const dist = Math.abs(diff.dot(projectionBasis.normal));
        if (dist > maxDistance) continue;
      }

      // Project centroid to SVG 2D space
      const { x, y } = inverseTransform(centroid3D);

      // Test if point is inside any SVG shape
      if (pointInShapes(x, y, shapes)) {
        hitTriangles.add(t);
      }
    }

    return hitTriangles;
  }

  /**
   * Apply the decal: set the material index for all hit triangles.
   * @param {import('../model/MeshModel.js').MeshModel} model
   * @param {Set<number>} hitTriangles
   * @param {number} materialIndex
   */
  apply(model, hitTriangles, materialIndex) {
    for (const t of hitTriangles) {
      model.setTriangleMaterial(t, materialIndex);
    }
  }
}
