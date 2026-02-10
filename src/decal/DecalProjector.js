import * as THREE from 'three';
import { pointInShapes } from '../utils/geometry.js';

/**
 * Projects a 2D SVG decal onto a 3D mesh using centroid testing.
 * Only projects onto front-facing triangles within the max depth.
 */
export class DecalProjector {
  /**
   * Find which triangles are covered by the decal.
   *
   * @param {import('../model/MeshModel.js').MeshModel} model
   * @param {Array<THREE.Shape>} shapes - SVG shapes
   * @param {{ inverseTransform: Function, projectionBasis: Object }} projection
   * @param {number} maxDistance - Max distance from decal plane (front side only)
   * @returns {Set<number>} Set of triangle indices that are "hit"
   */
  project(model, shapes, projection, maxDistance = Infinity) {
    const hitTriangles = new Set();
    const { inverseTransform, projectionBasis } = projection;
    const normal = projectionBasis.normal;
    const origin = projectionBasis.origin;

    // Precompute reusable vectors
    const diff = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const triNormal = new THREE.Vector3();

    for (let t = 0; t < model.triangleCount; t++) {
      const centroid = model.getTriangleCentroid(t);
      diff.set(centroid.x, centroid.y, centroid.z).sub(origin);

      // Signed distance from decal plane — positive = in front, negative = behind
      const signedDist = diff.dot(normal);

      // Only project onto the front side of the decal anchor.
      // Allow a small tolerance behind the surface for triangles near the anchor.
      if (signedDist < -0.5) continue;

      // Enforce max depth
      if (signedDist > maxDistance) continue;

      // Backface culling: skip triangles facing away from the projection
      const idx = t * 3;
      const v1i = model.triangles[idx] * 3;
      const v2i = model.triangles[idx + 1] * 3;
      const v3i = model.triangles[idx + 2] * 3;

      edge1.set(
        model.vertices[v2i] - model.vertices[v1i],
        model.vertices[v2i + 1] - model.vertices[v1i + 1],
        model.vertices[v2i + 2] - model.vertices[v1i + 2]
      );
      edge2.set(
        model.vertices[v3i] - model.vertices[v1i],
        model.vertices[v3i + 1] - model.vertices[v1i + 1],
        model.vertices[v3i + 2] - model.vertices[v1i + 2]
      );
      triNormal.crossVectors(edge1, edge2);

      // Triangle must face roughly toward the projector (opposite to decal normal).
      // Skip backfacing triangles.
      if (triNormal.dot(normal) > 0) continue;

      // Project centroid to SVG 2D space and test containment
      const centroid3D = new THREE.Vector3(centroid.x, centroid.y, centroid.z);
      const { x, y } = inverseTransform(centroid3D);

      if (pointInShapes(x, y, shapes)) {
        hitTriangles.add(t);
      }
    }

    return hitTriangles;
  }

  /**
   * Apply the decal: set the material index for all hit triangles.
   */
  apply(model, hitTriangles, materialIndex) {
    for (const t of hitTriangles) {
      model.setTriangleMaterial(t, materialIndex);
    }
  }
}
