/**
 * src/master/context-monitor.js — Historique conversationnel par session (E4)
 *
 * Maintient un buffer glissant de messages par projet.
 * Quand le buffer dépasse MAX_TURNS, les tours les plus anciens sont supprimés (rotation glissante).
 * Commande /reset pour vider manuellement.
 */

const MAX_TURNS = 10;

export class ContextMonitor {
  constructor() {
    // Map<projectKey, { history: [{role, content}], turnCount: number }>
    this._sessions = new Map();
  }

  _get(key) {
    if (!this._sessions.has(key)) {
      this._sessions.set(key, { history: [], turnCount: 0 });
    }
    return this._sessions.get(key);
  }

  // Ajoute un échange user+assistant à l'historique
  push(projectKey, userMsg, assistantReply) {
    const s = this._get(projectKey);
    s.history.push({ role: 'user', content: userMsg });
    s.history.push({ role: 'assistant', content: assistantReply });
    s.turnCount++;

    // Rotation : garde les MAX_TURNS derniers échanges (2 msg par tour)
    if (s.history.length > MAX_TURNS * 2) {
      s.history = s.history.slice(-MAX_TURNS * 2);
    }
  }

  // Formate l'historique en contexte textuel pour claude --print
  getContext(projectKey) {
    const s = this._get(projectKey);
    if (!s.history.length) return '';
    return s.history
      .map(m => `${m.role === 'user' ? 'Malik' : 'Master'}: ${m.content}`)
      .join('\n');
  }

  reset(projectKey) {
    this._sessions.delete(projectKey);
  }

  turnCount(projectKey) {
    return this._get(projectKey).turnCount;
  }
}
