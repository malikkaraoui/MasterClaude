// src/vault/extractors/go.js — détecte les fonctions et types Go

/**
 * Compte les fonctions et types Go
 * @param {string} content - Contenu du fichier Go
 * @returns {number} Nombre de fonctions + types trouvés
 */
export function extractGoSymbols(content) {
  const funcs = (content.match(/^func(?:\s+\([^)]*\))?\s+\w+/gm) || []).length;
  const types = (content.match(/^type\s+\w+/gm) || []).length;
  return funcs + types;
}
