import * as THREE from 'three';

/**
 * Projects a 2D SVG decal onto a 3D mesh using multi-point bitmap testing.
 * Tests 7 points per triangle (centroid + 3 vertices + 3 edge midpoints)
 * against a pre-rasterized bitmap for fast O(1) point-in-shape lookups.
 */
export class DecalProjector {
  /**
   * Find which triangles are covered by the decal.
   *
   * @param {import('../model/MeshModel.js').MeshModel} model
   * @param {{ data: Uint8ClampedArray, width: number, height: number, bounds: Object }} bitmap
   * @param {{ inverseTransform: Function, projectionBasis: Object, worldScale: number, svgCenter: {x,y} }} projection
   * @param {number} maxDistance - Max distance from decal plane (front side only)
   * @returns {Set<number>} Set of triangle indices that are "hit"
   */
  project(model, bitmap, projection, maxDistance = Infinity) {
    if (!bitmap) return new Set();

    const hitTriangles = new Set();
    const { projectionBasis, worldScale, svgCenter } = projection;
    const normal = projectionBasis.normal;
    const origin = projectionBasis.origin;
    const uAxis = projectionBasis.uAxis;
    const vAxis = projectionBasis.vAxis;

    // Precompute inverse transform constants to avoid allocations in the loop
    const invScale = 1 / worldScale;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const ux = uAxis.x, uy = uAxis.y, uz = uAxis.z;
    const vx = vAxis.x, vy = vAxis.y, vz = vAxis.z;
    const nx = normal.x, ny = normal.y, nz = normal.z;
    const scx = svgCenter.x, scy = svgCenter.y;

    // Bitmap lookup constants
    const bData = bitmap.data;
    const bw = bitmap.width;
    const bh = bitmap.height;
    const bbx = bitmap.bounds.x;
    const bby = bitmap.bounds.y;
    const bbw = bitmap.bounds.width;
    const bbh = bitmap.bounds.height;

    // Reusable vectors for backface culling
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const triNormal = new THREE.Vector3();

    for (let t = 0; t < model.triangleCount; t++) {
      const idx = t * 3;
      const v1i = model.triangles[idx] * 3;
      const v2i = model.triangles[idx + 1] * 3;
      const v3i = model.triangles[idx + 2] * 3;

      // Get vertex positions
      const ax = model.vertices[v1i], ay = model.vertices[v1i + 1], az = model.vertices[v1i + 2];
      const bx = model.vertices[v2i], by = model.vertices[v2i + 1], bz = model.vertices[v2i + 2];
      const cx = model.vertices[v3i], cy = model.vertices[v3i + 1], cz = model.vertices[v3i + 2];

      // Centroid
      const centX = (ax + bx + cx) / 3;
      const centY = (ay + by + cy) / 3;
      const centZ = (az + bz + cz) / 3;

      // Signed distance from decal plane
      const dx = centX - ox, dy = centY - oy, dz = centZ - oz;
      const signedDist = dx * nx + dy * ny + dz * nz;

      // Only front side (small tolerance behind for near-surface triangles)
      if (signedDist < -0.5) continue;
      if (signedDist > maxDistance) continue;

      // Backface culling
      edge1.set(bx - ax, by - ay, bz - az);
      edge2.set(cx - ax, cy - ay, cz - az);
      triNormal.crossVectors(edge1, edge2);
      if (triNormal.x * nx + triNormal.y * ny + triNormal.z * nz > 0) continue;

      // Test 7 points: centroid, 3 vertices, 3 edge midpoints
      // Inline inverse transform: diff = pt - origin, svgX = diff.dot(u)/scale + scx, svgY = -(diff.dot(v)/scale) + scy
      const testPts = [
        centX, centY, centZ,
        ax, ay, az,
        bx, by, bz,
        cx, cy, cz,
        (ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5,
        (ax + cx) * 0.5, (ay + cy) * 0.5, (az + cz) * 0.5,
        (bx + cx) * 0.5, (by + cy) * 0.5, (bz + cz) * 0.5,
      ];

      let hit = false;
      for (let p = 0; p < 21; p += 3) {
        const pdx = testPts[p] - ox;
        const pdy = testPts[p + 1] - oy;
        const pdz = testPts[p + 2] - oz;

        // Inverse transform to SVG 2D space
        const svgX = (pdx * ux + pdy * uy + pdz * uz) * invScale + scx;
        const svgY = -((pdx * vx + pdy * vy + pdz * vz) * invScale) + scy;

        // Bitmap lookup
        const px = Math.floor((svgX - bbx) / bbw * bw);
        const py = Math.floor((svgY - bby) / bbh * bh);
        if (px >= 0 && px < bw && py >= 0 && py < bh) {
          if (bData[(py * bw + px) * 4] > 128) {
            hit = true;
            break;
          }
        }
      }

      if (hit) {
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
