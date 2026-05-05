// src/vault/extractors/js.js — extraction symboles JS/TS par regex

/**
 * Compte les symboles JS/TS (fonctions et classes) dans le contenu
 * @param {string} content - Contenu du fichier
 * @returns {number} Nombre de symboles trouvés
 */
export function extractJsSymbols(content) {
  const matches = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+|(?:export\s+)?class\s+\w+/g) || [];
  return matches.length;
}
