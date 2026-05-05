#!/bin/bash
# scripts/memory-init.sh — Initialize 3-level memory database schema
#
# Usage: bash scripts/memory-init.sh [path/to/memory.db]
# Default: .claude/memory.db

set -e

DB_PATH="${1:-.claude/memory.db}"

# If DB exists, skip
if [ -f "$DB_PATH" ]; then
  echo "Database already exists at $DB_PATH, skip initialization"
  exit 0
fi

# Create parent directory if needed
mkdir -p "$(dirname "$DB_PATH")"

# Initialize database with full schema
sqlite3 "$DB_PATH" << 'SQL'
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE episodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL UNIQUE,
    timestamp     TEXT NOT NULL,
    summary       TEXT NOT NULL,
    topics        TEXT,
    files_touched TEXT,
    model_used    TEXT,
    duration_min  INTEGER,
    project       TEXT
);

CREATE TABLE nodes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT UNIQUE NOT NULL,
    type         TEXT NOT NULL CHECK(type IN ('script','config','concept','skill','project','person')),
    description  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    access_count INTEGER DEFAULT 0
);

CREATE TABLE edges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation   TEXT NOT NULL CHECK(relation IN ('depends_on','relates_to','part_of','uses')),
    weight     REAL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

CREATE TABLE embeddings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type   TEXT NOT NULL CHECK(ref_type IN ('episode','node')),
    ref_id     INTEGER NOT NULL,
    model      TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    vector     BLOB NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(ref_type, ref_id, model)
);

-- Indexes
CREATE INDEX idx_episodes_project ON episodes(project);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_embeddings_ref ON embeddings(ref_type, ref_id);

-- FTS5
CREATE VIRTUAL TABLE episodes_fts USING fts5(summary, topics);
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, description);

-- FTS5 triggers for episodes
CREATE TRIGGER episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, summary, topics) VALUES (new.id, new.summary, new.topics);
END;
CREATE TRIGGER episodes_au AFTER UPDATE ON episodes BEGIN
    UPDATE episodes_fts SET summary = new.summary, topics = new.topics WHERE rowid = new.id;
END;
CREATE TRIGGER episodes_ad AFTER DELETE ON episodes BEGIN
    DELETE FROM episodes_fts WHERE rowid = old.id;
END;

-- FTS5 triggers for nodes
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, name, description) VALUES (new.id, new.name, new.description);
END;
CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
    UPDATE nodes_fts SET name = new.name, description = new.description WHERE rowid = new.id;
END;
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
    DELETE FROM nodes_fts WHERE rowid = old.id;
END;
SQL

echo "Database initialized at $DB_PATH"
