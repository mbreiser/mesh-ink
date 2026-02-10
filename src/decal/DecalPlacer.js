import * as THREE from 'three';

/**
 * Handles interactive placement of a decal on the mesh surface.
 * The decal is defined by:
 *   - An anchor point on the mesh surface
 *   - A projection direction (surface normal at the anchor)
 *   - A scale factor
 *   - An "up" direction for orienting the decal
 */
export class DecalPlacer {
  constructor() {
    this.anchorPoint = null;   // THREE.Vector3 — point on mesh surface
    this.normal = null;        // THREE.Vector3 — projection direction
    this.scale = 1.0;
    this.rotation = 0;         // Radians around normal
    this.active = false;

    // Visualization helpers
    this.helper = null;
  }

  /**
   * Set the anchor from a raycast hit.
   * @param {THREE.Vector3} point - Intersection point
   * @param {THREE.Vector3} normal - Face normal at intersection
   */
  setAnchor(point, normal) {
    this.anchorPoint = point.clone();
    this.normal = normal.clone().normalize();
    this.active = true;
  }

  /**
   * Build the projection matrix that maps SVG 2D coordinates
   * to 3D space on the mesh surface.
   *
   * The matrix maps from SVG space (centered, scaled) to world space,
   * such that the SVG lies on a plane at the anchor point, facing along the normal.
   *
   * @param {{ x: number, y: number, width: number, height: number }} svgBounds
   * @returns {{ projectionBasis: { origin, uAxis, vAxis, normal }, transform: Function }}
   */
  getProjection(svgBounds) {
    if (!this.active) return null;

    // Build a local coordinate frame on the surface
    // uAxis and vAxis are tangent to the surface at the anchor
    const normal = this.normal;
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(up)) > 0.99) {
      up = new THREE.Vector3(0, 0, 1);
    }

    let uAxis = new THREE.Vector3().crossVectors(up, normal).normalize();
    let vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

    // Apply rotation around normal
    if (this.rotation !== 0) {
      const rotMatrix = new THREE.Matrix4().makeRotationAxis(normal, this.rotation);
      uAxis.applyMatrix4(rotMatrix);
      vAxis.applyMatrix4(rotMatrix);
    }

    // Scale: the SVG's bounding box maps to a certain size in world units
    const svgSize = Math.max(svgBounds.width, svgBounds.height);
    const worldScale = this.scale / svgSize;

    const svgCenterX = svgBounds.x + svgBounds.width / 2;
    const svgCenterY = svgBounds.y + svgBounds.height / 2;
    const origin = this.anchorPoint;

    // Transform function: SVG point → world point on the surface
    const transform = (svgX, svgY) => {
      const localX = (svgX - svgCenterX) * worldScale;
      const localY = -(svgY - svgCenterY) * worldScale; // Flip Y (SVG Y is down)

      return new THREE.Vector3()
        .copy(origin)
        .addScaledVector(uAxis, localX)
        .addScaledVector(vAxis, localY);
    };

    // Inverse: project a 3D world point onto the SVG 2D plane
    const inverseTransform = (worldPoint) => {
      const diff = new THREE.Vector3().subVectors(worldPoint, origin);
      const localX = diff.dot(uAxis) / worldScale + svgCenterX;
      const localY = -(diff.dot(vAxis) / worldScale) + svgCenterY;
      return { x: localX, y: localY };
    };

    return {
      projectionBasis: { origin, uAxis, vAxis, normal },
      transform,
      inverseTransform,
      worldScale,
      svgCenter: { x: svgCenterX, y: svgCenterY },
    };
  }
}
