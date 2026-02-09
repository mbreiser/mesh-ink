import { MaterialPalette } from './MaterialPalette.js';

/**
 * Internal mesh representation.
 * Stores vertices, triangle indices, and per-triangle material IDs.
 */
export class MeshModel {
  /**
   * @param {Float32Array} vertices - Flat array [x0,y0,z0, x1,y1,z1, ...]
   * @param {Uint32Array} triangles - Flat array [v1_0,v2_0,v3_0, v1_1,v2_1,v3_1, ...]
   * @param {Uint32Array} triangleMaterials - Material index per triangle
   * @param {MaterialPalette} palette
   */
  constructor(vertices, triangles, triangleMaterials, palette) {
    this.vertices = vertices;
    this.triangles = triangles;
    this.triangleMaterials = triangleMaterials;
    this.palette = palette;
  }

  get vertexCount() {
    return this.vertices.length / 3;
  }

  get triangleCount() {
    return this.triangles.length / 3;
  }

  /**
   * Get the centroid of a triangle by index.
   * @returns {{x: number, y: number, z: number}}
   */
  getTriangleCentroid(triIndex) {
    const i = triIndex * 3;
    const v1 = this.triangles[i];
    const v2 = this.triangles[i + 1];
    const v3 = this.triangles[i + 2];

    const x = (this.vertices[v1 * 3] + this.vertices[v2 * 3] + this.vertices[v3 * 3]) / 3;
    const y = (this.vertices[v1 * 3 + 1] + this.vertices[v2 * 3 + 1] + this.vertices[v3 * 3 + 1]) / 3;
    const z = (this.vertices[v1 * 3 + 2] + this.vertices[v2 * 3 + 2] + this.vertices[v3 * 3 + 2]) / 3;

    return { x, y, z };
  }

  /**
   * Set the material for a triangle.
   */
  setTriangleMaterial(triIndex, materialIndex) {
    this.triangleMaterials[triIndex] = materialIndex;
  }
}
