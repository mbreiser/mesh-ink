/**
 * XML helpers for 3MF parsing and generation.
 */

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';

/**
 * Parse an XML string into a Document.
 */
export function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'application/xml');
}

/**
 * Serialize a Document back to an XML string.
 */
export function serializeXML(doc) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Query elements by local name within the 3MF core namespace.
 */
export function getElementsByLocalName(parent, localName) {
  return Array.from(parent.getElementsByTagNameNS(CORE_NS, localName));
}

/**
 * Query elements by local name in any namespace (fallback).
 */
export function getElementsByTagName(parent, localName) {
  // Try namespace-aware first, then fall back to local name match
  let elements = Array.from(parent.getElementsByTagNameNS(CORE_NS, localName));
  if (elements.length === 0) {
    elements = Array.from(parent.getElementsByTagNameNS('*', localName));
  }
  if (elements.length === 0) {
    elements = Array.from(parent.getElementsByTagName(localName));
  }
  return elements;
}

export { CORE_NS };
