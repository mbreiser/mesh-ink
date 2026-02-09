import JSZip from 'jszip';
import { MeshModel } from '../model/MeshModel.js';
import { MaterialPalette } from '../model/MaterialPalette.js';
import { parseXML, getElementsByTagName } from '../utils/xml.js';

/**
 * Parse a 3MF file (ArrayBuffer) into a MeshModel.
 * Preserves the original ZIP for round-tripping.
 */
export class ThreeMFReader {
  /**
   * @param {ArrayBuffer} buffer - The 3MF file contents
   * @returns {Promise<{model: MeshModel, zip: JSZip}>}
   */
  async read(buffer) {
    const zip = await JSZip.loadAsync(buffer);

    // Find the model XML — typically at 3D/3dmodel.model
    const modelPath = await this._findModelPath(zip);
    if (!modelPath) {
      throw new Error('Could not find 3D model XML in 3MF archive');
    }

    const xmlString = await zip.file(modelPath).async('string');
    const doc = parseXML(xmlString);

    // Parse materials
    const palette = this._parseMaterials(doc);

    // If no materials found, add a default gray
    if (palette.count === 0) {
      palette.addMaterial('Default', '#CCCCCC');
    }

    // Parse mesh(es) — for V1 we combine all objects into one mesh
    const { vertices, triangles, triangleMaterials } = this._parseMeshes(doc, palette);

    const model = new MeshModel(vertices, triangles, triangleMaterials, palette);
    return { model, zip, modelPath };
  }

  async _findModelPath(zip) {
    // Check standard location first
    if (zip.file('3D/3dmodel.model')) {
      return '3D/3dmodel.model';
    }

    // Try to find from relationships
    const relsFile = zip.file('_rels/.rels');
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      const doc = parseXML(relsXml);
      const rels = doc.getElementsByTagName('Relationship');
      for (const rel of rels) {
        const type = rel.getAttribute('Type');
        if (type && type.includes('3dmodel')) {
          let target = rel.getAttribute('Target');
          if (target.startsWith('/')) target = target.substring(1);
          if (zip.file(target)) return target;
        }
      }
    }

    // Brute-force search for .model files
    for (const path of Object.keys(zip.files)) {
      if (path.endsWith('.model')) return path;
    }

    return null;
  }

  _parseMaterials(doc) {
    const palette = new MaterialPalette();
    const baseMaterials = getElementsByTagName(doc, 'basematerials');

    for (const bmGroup of baseMaterials) {
      const bases = getElementsByTagName(bmGroup, 'base');
      for (const base of bases) {
        const name = base.getAttribute('name') || `Color ${palette.count}`;
        let color = base.getAttribute('displaycolor') || '#CCCCCC';
        // Normalize: strip alpha for internal use if present, keep 6-char hex
        palette.addMaterial(name, color);
      }
    }

    return palette;
  }

  _parseMeshes(doc, palette) {
    const allVertices = [];
    const allTriangles = [];
    const allTriMaterials = [];
    let vertexOffset = 0;

    // Build a map of basematerials id → starting material index in our palette
    const materialGroupMap = this._buildMaterialGroupMap(doc, palette);

    const objects = getElementsByTagName(doc, 'object');
    for (const obj of objects) {
      const meshElements = getElementsByTagName(obj, 'mesh');
      for (const meshEl of meshElements) {
        const vertexEls = getElementsByTagName(meshEl, 'vertex');
        const triangleEls = getElementsByTagName(meshEl, 'triangle');

        // Parse vertices — 3MF is typically Z-up, Three.js is Y-up
        // Swap Y and Z on import
        for (const v of vertexEls) {
          const x = parseFloat(v.getAttribute('x'));
          const y = parseFloat(v.getAttribute('y'));
          const z = parseFloat(v.getAttribute('z'));
          // Z-up → Y-up: x stays, y = z, z = -y (or just swap y/z)
          allVertices.push(x, z, -y);
        }

        // Parse triangles
        for (const tri of triangleEls) {
          const v1 = parseInt(tri.getAttribute('v1')) + vertexOffset;
          const v2 = parseInt(tri.getAttribute('v2')) + vertexOffset;
          const v3 = parseInt(tri.getAttribute('v3')) + vertexOffset;
          allTriangles.push(v1, v2, v3);

          // Material assignment
          const pid = tri.getAttribute('pid');
          const p1 = tri.getAttribute('p1');
          let matIndex = 0;
          if (pid && p1 !== null && p1 !== undefined) {
            const groupOffset = materialGroupMap.get(pid) || 0;
            matIndex = groupOffset + parseInt(p1);
          }
          allTriMaterials.push(matIndex);
        }

        vertexOffset += vertexEls.length;
      }
    }

    return {
      vertices: new Float32Array(allVertices),
      triangles: new Uint32Array(allTriangles),
      triangleMaterials: new Uint32Array(allTriMaterials),
    };
  }

  /**
   * Build a map from basematerials group `id` attribute to the starting
   * index in our flat palette. This handles files with multiple
   * <basematerials> groups.
   */
  _buildMaterialGroupMap(doc, palette) {
    const map = new Map();
    const baseMaterials = getElementsByTagName(doc, 'basematerials');
    let offset = 0;

    for (const bmGroup of baseMaterials) {
      const id = bmGroup.getAttribute('id');
      map.set(id, offset);
      const bases = getElementsByTagName(bmGroup, 'base');
      offset += bases.length;
    }

    return map;
  }
}
