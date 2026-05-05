// src/vault/extractors/shell.js — détecte les fonctions shell (bash/sh/zsh)

/**
 * Compte les fonctions shell dans le contenu
 * @param {string} content - Contenu du fichier shell
 * @returns {number} Nombre de fonctions trouvées
 */
export function extractShellSymbols(content) {
  const matches = content.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*\)\s*(?:\{|$)/gm) || [];
  return matches.length;
}
