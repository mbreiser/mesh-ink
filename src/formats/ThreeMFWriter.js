import JSZip from 'jszip';
import { CORE_NS } from '../utils/xml.js';

/**
 * Export a MeshModel back to 3MF format.
 * Preserves the original ZIP contents for Bambu Studio compatibility.
 */
export class ThreeMFWriter {
  /**
   * @param {import('../model/MeshModel.js').MeshModel} model
   * @param {JSZip} originalZip - The original ZIP to preserve metadata
   * @param {string} modelPath - Path within ZIP for the model XML
   * @returns {Promise<Blob>}
   */
  async write(model, originalZip, modelPath) {
    // Clone the original ZIP so we don't mutate it
    const zip = new JSZip();

    // Copy all original files
    for (const [path, file] of Object.entries(originalZip.files)) {
      if (file.dir) continue;
      if (path === modelPath) continue; // We'll regenerate this
      const data = await file.async('arraybuffer');
      zip.file(path, data);
    }

    // Generate updated model XML
    const modelXml = this._generateModelXml(model, originalZip, modelPath);
    zip.file(modelPath, modelXml);

    // Ensure content types and rels exist
    await this._ensureContentTypes(zip);
    await this._ensureRels(zip, modelPath);

    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
  }

  _generateModelXml(model, originalZip, modelPath) {
    // Try to preserve the original XML structure's namespace declarations
    // by reading the original and modifying just the mesh/materials
    const xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}">`);
    xml.push('  <resources>');

    // Write materials
    xml.push('    <basematerials id="1">');
    for (let i = 0; i < model.palette.count; i++) {
      const mat = model.palette.getMaterial(i);
      const name = this._escapeXml(mat.name);
      const color = mat.color;
      xml.push(`      <base name="${name}" displaycolor="${color}"/>`);
    }
    xml.push('    </basematerials>');

    // Write mesh object
    xml.push('    <object id="2" type="model">');
    xml.push('      <mesh>');

    // Vertices — reverse the Y/Z swap we did on import
    xml.push('        <vertices>');
    for (let i = 0; i < model.vertices.length; i += 3) {
      const x = model.vertices[i];
      const yThree = model.vertices[i + 1]; // was z in 3MF
      const zThree = model.vertices[i + 2]; // was -y in 3MF
      // Reverse: 3MF_x = x, 3MF_y = -zThree, 3MF_z = yThree
      xml.push(`          <vertex x="${x}" y="${-zThree}" z="${yThree}"/>`);
    }
    xml.push('        </vertices>');

    // Triangles
    xml.push('        <triangles>');
    for (let i = 0; i < model.triangles.length; i += 3) {
      const v1 = model.triangles[i];
      const v2 = model.triangles[i + 1];
      const v3 = model.triangles[i + 2];
      const matIdx = model.triangleMaterials[i / 3];
      xml.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="1" p1="${matIdx}"/>`);
    }
    xml.push('        </triangles>');

    xml.push('      </mesh>');
    xml.push('    </object>');
    xml.push('  </resources>');
    xml.push('  <build>');
    xml.push('    <item objectid="2"/>');
    xml.push('  </build>');
    xml.push('</model>');

    return xml.join('\n');
  }

  async _ensureContentTypes(zip) {
    if (!zip.file('[Content_Types].xml')) {
      zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
        '</Types>');
    }
  }

  async _ensureRels(zip, modelPath) {
    if (!zip.file('_rels/.rels')) {
      zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        `  <Relationship Target="/${modelPath}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
        '</Relationships>');
    }
  }

  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
