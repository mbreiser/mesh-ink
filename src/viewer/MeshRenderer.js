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

  /**
   * Show the SVG decal outline as 3D lines on the mesh surface.
   * This gives the user a clear visual preview of the decal shape.
   * @param {Array<THREE.Shape>} shapes - SVG shapes to render
   * @param {{ transform: Function, projectionBasis: Object }} projection
   */
  showDecalOutline(shapes, projection) {
    this.removeDecalOutline();

    const { transform, projectionBasis } = projection;
    const normal = projectionBasis.normal;

    // Offset lines slightly along the normal to prevent z-fighting
    const offset = new THREE.Vector3().copy(normal).multiplyScalar(0.15);

    this._outlineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      depthTest: true,
      transparent: true,
      opacity: 0.9,
    });

    this._outlineGroup = new THREE.Group();

    for (const shape of shapes) {
      const points = shape.getPoints(64);
      if (points.length < 2) continue;

      const points3D = [];
      for (const p of points) {
        const worldPt = transform(p.x, p.y);
        points3D.push(worldPt.clone().add(offset));
      }
      // Close the loop
      const first = transform(points[0].x, points[0].y);
      points3D.push(first.clone().add(offset));

      const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
      this._outlineGroup.add(new THREE.Line(geometry, this._outlineMaterial));

      // Draw holes
      if (shape.holes) {
        for (const hole of shape.holes) {
          const holePoints = hole.getPoints(64);
          if (holePoints.length < 2) continue;

          const holePoints3D = [];
          for (const p of holePoints) {
            const wp = transform(p.x, p.y);
            holePoints3D.push(wp.clone().add(offset));
          }
          const firstHole = transform(holePoints[0].x, holePoints[0].y);
          holePoints3D.push(firstHole.clone().add(offset));

          const holeGeo = new THREE.BufferGeometry().setFromPoints(holePoints3D);
          this._outlineGroup.add(new THREE.Line(holeGeo, this._outlineMaterial));
        }
      }
    }

    this.scene.add(this._outlineGroup);
  }

  /**
   * Remove the SVG decal outline preview.
   */
  removeDecalOutline() {
    if (this._outlineGroup) {
      this._outlineGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
      if (this._outlineMaterial) {
        this._outlineMaterial.dispose();
        this._outlineMaterial = null;
      }
      this.scene.remove(this._outlineGroup);
      this._outlineGroup = null;
    }
  }

  clear() {
    this.removeDecalOutline();
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
