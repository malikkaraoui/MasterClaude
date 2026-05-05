/**
 * Utilitaires de fusion de configuration Claude Atelier.
 *
 * Règles :
 *   - settings.json     : deep merge, clés terminales suivent winner
 *   - hooks/*, agents/* : union par nom de fichier, collision → winner gagne + warning
 *   - .mcp.json         : merge par clé mcpServers.<name>, winner gagne
 *   - skills/           : union stricte, préfixe atelier- sur les skills injectés
 */


/**
 * Fusionne deux objets JSON selon la règle winner.
 * @param {unknown} existing
 * @param {unknown} injected
 * @param {'existing' | 'injected'} winner
 * @returns {unknown}
 */
function deepMergeObjects(existing, injected, winner) {
  if (existing === null || existing === undefined) return injected;
  if (injected === null || injected === undefined) return existing;
  if (typeof existing !== 'object' || typeof injected !== 'object') {
    return winner === 'existing' ? existing : injected;
  }
  if (Array.isArray(existing) || Array.isArray(injected)) {
    return winner === 'existing' ? existing : injected;
  }

  const result = { ...injected };
  for (const [key, existingVal] of Object.entries(existing)) {
    if (key in result) {
      result[key] = deepMergeObjects(existingVal, result[key], winner);
    } else {
      result[key] = existingVal;
    }
  }
  return result;
}

/**
 * Merge settings.json : deep merge, winner gagne sur les clés terminales.
 * @param {unknown} existing  contenu existant (objet parsé)
 * @param {unknown} injected  contenu injecté
 * @param {'existing' | 'injected'} winner
 * @returns {unknown}
 */
export function mergeSettings(existing, injected, winner) {
  return deepMergeObjects(existing, injected, winner);
}

/**
 * Merge mcpServers : union par clé, winner gagne sur collision.
 * @param {Record<string, unknown>} existing
 * @param {Record<string, unknown>} injected
 * @param {'existing' | 'injected'} winner
 * @returns {{ merged: Record<string, unknown>, warnings: string[] }}
 */
export function mergeMcpServers(existing, injected, winner) {
  const warnings = [];
  const merged = { ...injected };

  for (const [name, existingServer] of Object.entries(existing)) {
    if (name in merged) {
      warnings.push(`mcpServers.${name} collision — ${winner} wins`);
      if (winner === 'existing') {
        merged[name] = existingServer;
      }
    } else {
      merged[name] = existingServer;
    }
  }
  return { merged, warnings };
}

/**
 * Merge de dossiers de fichiers (hooks/* ou agents/*) :
 * union par nom de fichier, collision → winner gagne + warning.
 * @param {string[]} existingFiles  noms de fichiers existants
 * @param {string[]} injectedFiles  noms de fichiers injectés
 * @param {'existing' | 'injected'} winner
 * @returns {{ toWrite: string[], toSkip: string[], warnings: string[] }}
 */
export function mergeFileDirectory(existingFiles, injectedFiles, winner) {
  const warnings = [];
  const existingSet = new Set(existingFiles);
  const toWrite = [];
  const toSkip = [];

  for (const file of injectedFiles) {
    if (existingSet.has(file)) {
      warnings.push(`${file} collision — ${winner} wins`);
      if (winner === 'injected') {
        toWrite.push(file);
      } else {
        toSkip.push(file);
      }
    } else {
      toWrite.push(file);
    }
  }
  return { toWrite, toSkip, warnings };
}

/**
 * Merge skills/ : union stricte.
 * Les skills injectés obtiennent le préfixe "atelier-".
 * @param {string[]} existingSkills  noms de skills existants
 * @param {string[]} injectedSkills  noms de skills à injecter (sans préfixe)
 * @returns {{ toInstall: string[], warnings: string[] }}
 */
export function mergeSkills(existingSkills, injectedSkills) {
  const warnings = [];
  const existingSet = new Set(existingSkills);
  const toInstall = [];

  for (const skill of injectedSkills) {
    const prefixed = skill.startsWith('atelier-') ? skill : `atelier-${skill}`;
    if (existingSet.has(prefixed)) {
      warnings.push(`skill ${prefixed} déjà présent — ignoré`);
    } else {
      toInstall.push(prefixed);
    }
  }
  return { toInstall, warnings };
}

