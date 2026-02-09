import * as THREE from 'three';
import { MaterialPalette } from '../model/MaterialPalette.js';

/**
 * Renders a MeshModel in a Three.js scene using per-triangle vertex colors.
 */
export class MeshRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshGroup = null;
    this.threeMesh = null;
    this.model = null;
  }

  /**
   * Load a MeshModel into the scene.
   * @param {import('../model/MeshModel.js').MeshModel} model
   */
  setModel(model) {
    this.clear();
    this.model = model;

    const geometry = new THREE.BufferGeometry();

    // Build position buffer — we need to "unindex" for per-triangle vertex colors
    const triCount = model.triangleCount;
    const positions = new Float32Array(triCount * 9);
    const colors = new Float32Array(triCount * 9);

    for (let t = 0; t < triCount; t++) {
      const i = t * 3;
      const v1 = model.triangles[i];
      const v2 = model.triangles[i + 1];
      const v3 = model.triangles[i + 2];

      // Positions
      positions[t * 9 + 0] = model.vertices[v1 * 3];
      positions[t * 9 + 1] = model.vertices[v1 * 3 + 1];
      positions[t * 9 + 2] = model.vertices[v1 * 3 + 2];

      positions[t * 9 + 3] = model.vertices[v2 * 3];
      positions[t * 9 + 4] = model.vertices[v2 * 3 + 1];
      positions[t * 9 + 5] = model.vertices[v2 * 3 + 2];

      positions[t * 9 + 6] = model.vertices[v3 * 3];
      positions[t * 9 + 7] = model.vertices[v3 * 3 + 1];
      positions[t * 9 + 8] = model.vertices[v3 * 3 + 2];

      // Colors — all 3 vertices of a triangle get the same material color
      const matIdx = model.triangleMaterials[t];
      const colorStr = model.palette.getColor(matIdx);
      const { r, g, b } = MaterialPalette.parseColor(colorStr);

      colors[t * 9 + 0] = r; colors[t * 9 + 1] = g; colors[t * 9 + 2] = b;
      colors[t * 9 + 3] = r; colors[t * 9 + 4] = g; colors[t * 9 + 5] = b;
      colors[t * 9 + 6] = r; colors[t * 9 + 7] = g; colors[t * 9 + 8] = b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    this.threeMesh = new THREE.Mesh(geometry, material);
    this.meshGroup = new THREE.Group();
    this.meshGroup.add(this.threeMesh);
    this.scene.add(this.meshGroup);
  }

  /**
   * Update vertex colors after material changes (e.g., after decal application).
   * @param {Set<number>} [changedTriangles] - If provided, only update these triangles
   */
  updateColors(changedTriangles) {
    if (!this.threeMesh || !this.model) return;

    const colorAttr = this.threeMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;
    const model = this.model;

    const updateTri = (t) => {
      const matIdx = model.triangleMaterials[t];
      const colorStr = model.palette.getColor(matIdx);
      const { r, g, b } = MaterialPalette.parseColor(colorStr);
      const base = t * 9;
      colors[base] = r; colors[base + 1] = g; colors[base + 2] = b;
      colors[base + 3] = r; colors[base + 4] = g; colors[base + 5] = b;
      colors[base + 6] = r; colors[base + 7] = g; colors[base + 8] = b;
    };

    if (changedTriangles) {
      for (const t of changedTriangles) {
        updateTri(t);
      }
    } else {
      for (let t = 0; t < model.triangleCount; t++) {
        updateTri(t);
      }
    }

    colorAttr.needsUpdate = true;
  }

  /**
   * Temporarily show a preview overlay on specific triangles.
   */
  previewTriangles(triangleIndices, color) {
    if (!this.threeMesh || !this.model) return;

    const colorAttr = this.threeMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;
    const { r, g, b } = MaterialPalette.parseColor(color);

    for (const t of triangleIndices) {
      const base = t * 9;
      colors[base] = r; colors[base + 1] = g; colors[base + 2] = b;
      colors[base + 3] = r; colors[base + 4] = g; colors[base + 5] = b;
      colors[base + 6] = r; colors[base + 7] = g; colors[base + 8] = b;
    }

    colorAttr.needsUpdate = true;
  }

  clear() {
    if (this.meshGroup) {
      this.scene.remove(this.meshGroup);
      if (this.threeMesh) {
        this.threeMesh.geometry.dispose();
        this.threeMesh.material.dispose();
      }
      this.meshGroup = null;
      this.threeMesh = null;
    }
  }
}
