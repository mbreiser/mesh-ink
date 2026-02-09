import { MeshModel } from '../model/MeshModel.js';
import { MaterialPalette } from '../model/MaterialPalette.js';

/**
 * Parse a binary or ASCII STL file into a MeshModel.
 */
export class STLReader {
  /**
   * @param {ArrayBuffer} buffer
   * @returns {MeshModel}
   */
  read(buffer) {
    const dataView = new DataView(buffer);

    // Check if ASCII STL (starts with "solid")
    const header = new Uint8Array(buffer, 0, 5);
    const headerStr = String.fromCharCode(...header);
    if (headerStr === 'solid') {
      // Could be ASCII, but some binary STLs also start with "solid"
      // Check if the file size matches binary format
      if (buffer.byteLength > 84) {
        const numTris = dataView.getUint32(80, true);
        const expectedSize = 84 + numTris * 50;
        if (expectedSize === buffer.byteLength) {
          return this._readBinary(dataView);
        }
      }
      return this._readASCII(buffer);
    }

    return this._readBinary(dataView);
  }

  _readBinary(dataView) {
    const numTriangles = dataView.getUint32(80, true);
    const vertices = new Float32Array(numTriangles * 9);
    const triangles = new Uint32Array(numTriangles * 3);
    const triangleMaterials = new Uint32Array(numTriangles);

    let offset = 84;
    for (let i = 0; i < numTriangles; i++) {
      // Skip normal (12 bytes)
      offset += 12;

      // Read 3 vertices, swap Y/Z for Three.js (STL is typically Z-up)
      for (let v = 0; v < 3; v++) {
        const vi = i * 9 + v * 3;
        const x = dataView.getFloat32(offset, true); offset += 4;
        const y = dataView.getFloat32(offset, true); offset += 4;
        const z = dataView.getFloat32(offset, true); offset += 4;
        vertices[vi] = x;
        vertices[vi + 1] = z;
        vertices[vi + 2] = -y;
      }

      // Skip attribute byte count
      offset += 2;

      // Indices — STL has no shared vertices, each tri has its own 3
      triangles[i * 3] = i * 3;
      triangles[i * 3 + 1] = i * 3 + 1;
      triangles[i * 3 + 2] = i * 3 + 2;

      triangleMaterials[i] = 0;
    }

    const palette = new MaterialPalette();
    palette.addMaterial('Default', '#CCCCCC');

    return new MeshModel(vertices, triangles, triangleMaterials, palette);
  }

  _readASCII(buffer) {
    const text = new TextDecoder().decode(buffer);
    const vertexPattern = /vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/gi;

    const verts = [];
    let match;
    while ((match = vertexPattern.exec(text)) !== null) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const z = parseFloat(match[3]);
      verts.push(x, z, -y);
    }

    const numTriangles = verts.length / 9;
    const vertices = new Float32Array(verts);
    const triangles = new Uint32Array(numTriangles * 3);
    const triangleMaterials = new Uint32Array(numTriangles);

    for (let i = 0; i < numTriangles; i++) {
      triangles[i * 3] = i * 3;
      triangles[i * 3 + 1] = i * 3 + 1;
      triangles[i * 3 + 2] = i * 3 + 2;
      triangleMaterials[i] = 0;
    }

    const palette = new MaterialPalette();
    palette.addMaterial('Default', '#CCCCCC');

    return new MeshModel(vertices, triangles, triangleMaterials, palette);
  }
}
