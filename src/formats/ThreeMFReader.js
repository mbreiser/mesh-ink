import JSZip from 'jszip';
import { MeshModel } from '../model/MeshModel.js';
import { MaterialPalette } from '../model/MaterialPalette.js';
import { parseXML, getElementsByTagName } from '../utils/xml.js';

const PRODUCTION_NS = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';

/**
 * Parse a 3MF file (ArrayBuffer) into a MeshModel.
 * Supports the 3MF Production Extension (multi-file, components)
 * and Bambu Studio multi-plate files.
 */
export class ThreeMFReader {
  /**
   * Read the 3MF archive and detect plates.
   * If multiple plates exist, returns plates array so the caller
   * can show a selector and then call readPlate().
   *
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{model?: MeshModel, zip: JSZip, modelPath: string, plates?: Array}>}
   */
  async read(buffer) {
    const zip = await JSZip.loadAsync(buffer);

    const modelPath = await this._findModelPath(zip);
    if (!modelPath) {
      throw new Error('Could not find 3D model XML in 3MF archive');
    }

    const xmlString = await zip.file(modelPath).async('string');
    const rootDoc = parseXML(xmlString);

    // Parse global materials from root doc
    const palette = this._parseMaterials(rootDoc);
    if (palette.count === 0) {
      palette.addMaterial('Default', '#CCCCCC');
    }

    // Resolve all objects — including external model files (Production Extension)
    const objectMap = await this._resolveAllObjects(zip, rootDoc, modelPath);

    // Parse build items
    const buildItems = this._parseBuildItems(rootDoc);

    // Parse plates from Bambu metadata
    const plates = await this._parsePlates(zip);

    // Store parsed data for later plate selection
    this._cache = { zip, modelPath, rootDoc, palette, objectMap, buildItems, plates };

    if (plates && plates.length > 1) {
      return { zip, modelPath, plates, model: null };
    }

    // Single plate or no plate info — load everything
    const model = this._buildModel(palette, objectMap, buildItems, null);
    return { model, zip, modelPath, plates };
  }

  /**
   * Load a specific plate by index.
   * @param {number} plateIndex - 0-based index into the plates array
   * @returns {{ model: MeshModel, zip: JSZip, modelPath: string }}
   */
  readPlate(plateIndex) {
    const { zip, modelPath, palette, objectMap, buildItems, plates } = this._cache;
    const plate = plates[plateIndex];
    const model = this._buildModel(palette.clone(), objectMap, buildItems, plate);
    return { model, zip, modelPath };
  }

  // --- Path finding ---

  async _findModelPath(zip) {
    if (zip.file('3D/3dmodel.model')) {
      return '3D/3dmodel.model';
    }

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

    for (const path of Object.keys(zip.files)) {
      if (path.endsWith('.model')) return path;
    }

    return null;
  }

  // --- Materials ---

  _parseMaterials(doc) {
    const palette = new MaterialPalette();
    const baseMaterials = getElementsByTagName(doc, 'basematerials');

    for (const bmGroup of baseMaterials) {
      const bases = getElementsByTagName(bmGroup, 'base');
      for (const base of bases) {
        const name = base.getAttribute('name') || `Color ${palette.count}`;
        const color = base.getAttribute('displaycolor') || '#CCCCCC';
        palette.addMaterial(name, color);
      }
    }

    return palette;
  }

  _buildMaterialGroupMap(doc) {
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

  // --- Object resolution (Production Extension) ---

  /**
   * Resolve all objects, including those in external model files
   * referenced via p:path on <component> elements.
   * Returns a Map keyed by "filePath#objectId".
   */
  async _resolveAllObjects(zip, rootDoc, rootPath) {
    const objectMap = new Map();

    // Parse objects from root doc
    const rootMaterialMap = this._buildMaterialGroupMap(rootDoc);
    this._parseObjectsFromDoc(rootDoc, rootPath, rootMaterialMap, objectMap);

    // Find external model files referenced by components
    const externalPaths = new Set();
    for (const [, obj] of objectMap) {
      if (obj.components) {
        for (const comp of obj.components) {
          if (comp.path && comp.path !== rootPath) {
            externalPaths.add(comp.path);
          }
        }
      }
    }

    // Parse external model files
    for (const extPath of externalPaths) {
      const file = zip.file(extPath);
      if (!file) continue;
      const xmlStr = await file.async('string');
      const doc = parseXML(xmlStr);
      const extMaterialMap = this._buildMaterialGroupMap(doc);

      // Merge any materials from external files into main palette tracking
      // (external files may define their own basematerials)
      this._mergeMaterials(doc);

      this._parseObjectsFromDoc(doc, extPath, extMaterialMap, objectMap);
    }

    return objectMap;
  }

  /**
   * Merge materials from an external model file into the main palette
   * stored in _cache (if they don't already exist).
   */
  _mergeMaterials(doc) {
    // For now, external file materials are handled via their own materialGroupMap
    // which maps pid→offset within that file's local material indices.
    // The main palette from the root doc is what gets exported.
  }

  _parseObjectsFromDoc(doc, filePath, materialGroupMap, objectMap) {
    const objects = getElementsByTagName(doc, 'object');

    for (const obj of objects) {
      const id = obj.getAttribute('id');
      const key = filePath + '#' + id;

      const meshElements = getElementsByTagName(obj, 'mesh');
      const componentElements = this._getDirectChildComponents(obj);

      if (meshElements.length > 0) {
        const meshData = this._parseMesh(meshElements[0], materialGroupMap);
        objectMap.set(key, { type: 'mesh', ...meshData, id, filePath });
      } else if (componentElements.length > 0) {
        const components = componentElements.map(c => this._parseComponent(c, filePath));
        objectMap.set(key, { type: 'components', components, id, filePath });
      }
    }
  }

  _getDirectChildComponents(objectEl) {
    const components = [];
    for (let i = 0; i < objectEl.childNodes.length; i++) {
      const node = objectEl.childNodes[i];
      if (node.nodeType === 1 && node.localName === 'components') {
        for (let j = 0; j < node.childNodes.length; j++) {
          const child = node.childNodes[j];
          if (child.nodeType === 1 && child.localName === 'component') {
            components.push(child);
          }
        }
      }
    }
    return components;
  }

  _parseComponent(compEl, currentFilePath) {
    const objectid = compEl.getAttribute('objectid');
    let path = compEl.getAttributeNS(PRODUCTION_NS, 'path')
      || compEl.getAttribute('p:path');
    if (path) {
      if (path.startsWith('/')) path = path.substring(1);
    } else {
      path = currentFilePath;
    }
    const transformStr = compEl.getAttribute('transform');
    const transform = transformStr ? this._parseTransform(transformStr) : null;
    return { objectid, path, transform };
  }

  _parseMesh(meshEl, materialGroupMap) {
    const vertexEls = getElementsByTagName(meshEl, 'vertex');
    const triangleEls = getElementsByTagName(meshEl, 'triangle');

    const vertices = [];
    for (const v of vertexEls) {
      vertices.push(
        parseFloat(v.getAttribute('x')),
        parseFloat(v.getAttribute('y')),
        parseFloat(v.getAttribute('z'))
      );
    }

    const triangles = [];
    const triangleMaterials = [];
    for (const tri of triangleEls) {
      triangles.push(
        parseInt(tri.getAttribute('v1')),
        parseInt(tri.getAttribute('v2')),
        parseInt(tri.getAttribute('v3'))
      );

      const pid = tri.getAttribute('pid');
      const p1 = tri.getAttribute('p1');
      let matIndex = 0;
      if (pid && p1 !== null && p1 !== undefined) {
        const groupOffset = materialGroupMap.get(pid) || 0;
        matIndex = groupOffset + parseInt(p1);
      }
      triangleMaterials.push(matIndex);
    }

    return { vertices, triangles, triangleMaterials, vertexCount: vertexEls.length };
  }

  // --- Build items ---

  _parseBuildItems(doc) {
    const items = [];
    const buildEls = getElementsByTagName(doc, 'build');
    if (buildEls.length === 0) return items;

    const itemEls = getElementsByTagName(buildEls[0], 'item');
    for (const itemEl of itemEls) {
      const objectid = itemEl.getAttribute('objectid');
      const transformStr = itemEl.getAttribute('transform');
      const transform = transformStr ? this._parseTransform(transformStr) : null;
      items.push({ objectid, transform });
    }
    return items;
  }

  // --- Plate metadata (Bambu Studio) ---

  async _parsePlates(zip) {
    const configFile = zip.file('Metadata/model_settings.config');
    if (!configFile) return null;

    try {
      const xmlStr = await configFile.async('string');
      const doc = parseXML(xmlStr);
      const plates = [];
      const plateEls = doc.getElementsByTagName('plate');

      for (const plateEl of plateEls) {
        const plate = { id: null, name: '', objectIds: [] };

        // Read direct-child metadata (not nested in model_instance)
        const metaEls = plateEl.childNodes;
        for (let i = 0; i < metaEls.length; i++) {
          const node = metaEls[i];
          if (node.nodeType !== 1 || node.tagName !== 'metadata') continue;
          const key = node.getAttribute('key');
          const value = node.getAttribute('value');
          if (key === 'plater_id') plate.id = parseInt(value);
          if (key === 'plater_name') plate.name = value || '';
        }

        // Read model_instance children for object IDs
        const instanceEls = plateEl.getElementsByTagName('model_instance');
        for (const inst of instanceEls) {
          const instMetas = inst.getElementsByTagName('metadata');
          for (const meta of instMetas) {
            if (meta.getAttribute('key') === 'object_id') {
              plate.objectIds.push(meta.getAttribute('value'));
            }
          }
        }

        if (plate.objectIds.length > 0) {
          plates.push(plate);
        }
      }

      return plates.length > 0 ? plates : null;
    } catch (e) {
      console.warn('Could not parse plate metadata:', e);
      return null;
    }
  }

  // --- Model building ---

  _buildModel(palette, objectMap, buildItems, plate) {
    const allVertices = [];
    const allTriangles = [];
    const allTriMaterials = [];
    let vertexOffset = 0;

    let items = buildItems;
    if (plate) {
      const plateObjectIds = new Set(plate.objectIds);
      const filtered = buildItems.filter(item => plateObjectIds.has(item.objectid));
      if (filtered.length > 0) items = filtered;
    }

    const rootPath = this._cache?.modelPath || '3D/3dmodel.model';

    for (const item of items) {
      const key = rootPath + '#' + item.objectid;
      vertexOffset = this._collectMeshData(
        objectMap, key, rootPath, item.transform,
        allVertices, allTriangles, allTriMaterials, vertexOffset
      );
    }

    // Fallback: if no data collected, try all mesh objects directly
    if (allVertices.length === 0) {
      for (const [, obj] of objectMap) {
        if (obj.type === 'mesh') {
          vertexOffset = this._appendMeshData(
            obj, null, allVertices, allTriangles, allTriMaterials, vertexOffset
          );
        }
      }
    }

    if (allVertices.length === 0) {
      throw new Error('No mesh data found in 3MF file');
    }

    return new MeshModel(
      new Float32Array(allVertices),
      new Uint32Array(allTriangles),
      new Uint32Array(allTriMaterials),
      palette
    );
  }

  /**
   * Recursively collect mesh data, following component references.
   */
  _collectMeshData(objectMap, key, rootPath, parentTransform,
                   allVertices, allTriangles, allTriMaterials, vertexOffset) {
    const obj = objectMap.get(key);
    if (!obj) return vertexOffset;

    if (obj.type === 'mesh') {
      return this._appendMeshData(
        obj, parentTransform, allVertices, allTriangles, allTriMaterials, vertexOffset
      );
    }

    if (obj.type === 'components') {
      for (const comp of obj.components) {
        const compKey = comp.path + '#' + comp.objectid;
        const combined = this._combineTransforms(parentTransform, comp.transform);
        vertexOffset = this._collectMeshData(
          objectMap, compKey, rootPath, combined,
          allVertices, allTriangles, allTriMaterials, vertexOffset
        );
      }
    }

    return vertexOffset;
  }

  _appendMeshData(meshObj, transform,
                  allVertices, allTriangles, allTriMaterials, vertexOffset) {
    const { vertices, triangles, triangleMaterials, vertexCount } = meshObj;

    for (let i = 0; i < vertices.length; i += 3) {
      let x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];

      if (transform) {
        const tx = transform[0] * x + transform[3] * y + transform[6] * z + transform[9];
        const ty = transform[1] * x + transform[4] * y + transform[7] * z + transform[10];
        const tz = transform[2] * x + transform[5] * y + transform[8] * z + transform[11];
        x = tx; y = ty; z = tz;
      }

      // 3MF Z-up → Three.js Y-up
      allVertices.push(x, z, -y);
    }

    for (let i = 0; i < triangles.length; i += 3) {
      allTriangles.push(
        triangles[i] + vertexOffset,
        triangles[i + 1] + vertexOffset,
        triangles[i + 2] + vertexOffset
      );
    }

    allTriMaterials.push(...triangleMaterials);
    return vertexOffset + vertexCount;
  }

  // --- Transform helpers ---

  /**
   * Parse a 3MF transform: 12 space-separated floats.
   * Layout: m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz
   */
  _parseTransform(str) {
    const parts = str.trim().split(/\s+/).map(Number);
    if (parts.length !== 12) return null;
    return new Float32Array(parts);
  }

  /**
   * Multiply two 3x4 affine transforms: result = a * b
   */
  _combineTransforms(a, b) {
    if (!a) return b;
    if (!b) return a;

    const r = new Float32Array(12);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        r[row * 3 + col] =
          a[0 * 3 + col] * b[row * 3 + 0] +
          a[1 * 3 + col] * b[row * 3 + 1] +
          a[2 * 3 + col] * b[row * 3 + 2];
      }
    }

    r[9]  = a[0] * b[9] + a[3] * b[10] + a[6] * b[11] + a[9];
    r[10] = a[1] * b[9] + a[4] * b[10] + a[7] * b[11] + a[10];
    r[11] = a[2] * b[9] + a[5] * b[10] + a[8] * b[11] + a[11];

    return r;
  }
}
