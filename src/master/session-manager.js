/**
 * src/master/session-manager.js — Registre et dispatch projets (E2)
 *
 * Permet au Master de router les messages vers un projet spécifique.
 * Commandes Telegram : /projets · /projet <nom|chemin> · /projet off
 * Config : ~/.claude-atelier/projects.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { loadProjectContext } from './vault-loader.js';

const CONFIG_DIR = join(process.env.HOME || os.homedir(), '.claude-atelier');
const REGISTRY_FILE = join(CONFIG_DIR, 'projects.json');

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export class SessionManager {
  constructor() {
    this._active = null; // { name, path } ou null = mode Master global
    this._registry = this._loadRegistry();
  }

  _loadRegistry() {
    try {
      return JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));
    } catch {
      return {};
    }
  }

  _saveRegistry() {
    ensureConfigDir();
    writeFileSync(REGISTRY_FILE, JSON.stringify(this._registry, null, 2));
  }

  // Ajoute ou met à jour un projet dans le registre
  register(name, path) {
    this._registry[name] = path;
    this._saveRegistry();
  }

  // Retourne le projet actif ou null
  get active() {
    return this._active;
  }

  // Change le projet actif par nom ou chemin
  activate(nameOrPath) {
    if (nameOrPath === 'off' || nameOrPath === 'none') {
      this._active = null;
      return null;
    }
    // Cherche par nom d'abord
    if (this._registry[nameOrPath]) {
      this._active = { name: nameOrPath, path: this._registry[nameOrPath] };
      return this._active;
    }
    // Puis par chemin direct si le dossier existe
    if (existsSync(nameOrPath)) {
      const name = nameOrPath.split('/').pop();
      this._active = { name, path: nameOrPath };
      return this._active;
    }
    return null;
  }

  // Retourne le cwd à utiliser pour claude --print
  getCwd(fallbackRoot) {
    return this._active?.path || fallbackRoot;
  }

  // Retourne le contexte projet actif (CLAUDE.md)
  getProjectContext() {
    if (!this._active) return '';
    return loadProjectContext(this._active.path);
  }

  // Retourne la liste des projets enregistrés
  list() {
    return Object.entries(this._registry).map(([name, path]) => `• ${name} → ${path}`).join('\n') || 'Aucun projet enregistré.';
  }

  // Parse une commande Telegram liée aux projets
  // Retourne { handled: bool, reply: string|null }
  handleCommand(text) {
    if (text === '/projets') {
      const active = this._active ? `\nActif : ${this._active.name}` : '\nAucun projet actif (mode Master global)';
      return { handled: true, reply: `Projets enregistrés :\n${this.list()}${active}` };
    }

    if (text.startsWith('/projet ')) {
      const arg = text.slice('/projet '.length).trim();
      const result = this.activate(arg);
      if (arg === 'off') {
        return { handled: true, reply: '🌐 Mode Master global (aucun projet actif)' };
      }
      if (result) {
        return { handled: true, reply: `📁 Projet actif : ${result.name}\n${result.path}` };
      }
      return { handled: true, reply: `❌ Projet "${arg}" non trouvé. Utilise /projets pour voir la liste.` };
    }

    if (text.startsWith('/register ')) {
      const parts = text.slice('/register '.length).trim().split(' ');
      if (parts.length < 2) {
        return { handled: true, reply: 'Usage : /register <nom> <chemin>' };
      }
      const [name, ...pathParts] = parts;
      const path = pathParts.join(' ');
      if (!existsSync(path)) {
        return { handled: true, reply: `❌ Chemin inexistant : ${path}` };
      }
      this.register(name, path);
      return { handled: true, reply: `✅ Projet "${name}" enregistré → ${path}` };
    }

    return { handled: false, reply: null };
  }
}
