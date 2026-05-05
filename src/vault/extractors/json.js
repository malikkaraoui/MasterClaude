// src/vault/extractors/json.js — compte les clés top-level d'un JSON

/**
 * Compte les clés ou éléments du JSON
 * @param {string} content - Contenu du fichier JSON
 * @returns {number} Nombre de clés (objet) ou d'éléments (tableau)
 */
export function extractJsonSymbols(content) {
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.keys(obj).length;
    if (Array.isArray(obj)) return obj.length;
    return 0;
  } catch {
    return 0;
  }
}
