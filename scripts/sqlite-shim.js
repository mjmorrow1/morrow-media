// better-sqlite3-compatible wrapper around Node's built-in node:sqlite.
// Used when the native addon cannot be compiled (for example Node 24 without build tools).
const { DatabaseSync } = require('node:sqlite');

function isReader(sql) {
  const s = String(sql).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').replace(/^\s*--[^\n]*\n/, '').trim();
  return /^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(s) || /\bRETURNING\b/i.test(s);
}

class Statement {
  constructor(db, sql) {
    this.sql = sql;
    this.reader = isReader(sql);
    this._stmt = db.prepare(sql);
  }
  all(...args) { return this._stmt.all(...args); }
  get(...args) { return this._stmt.get(...args) || undefined; }
  run(...args) {
    const r = this._stmt.run(...args);
    return { changes: Number(r.changes || 0), lastInsertRowid: Number(r.lastInsertRowid || 0) };
  }
}

class Database {
  constructor(path) {
    this._db = new DatabaseSync(path === ':memory:' ? ':memory:' : path);
  }
  exec(sql) { this._db.exec(sql); return this; }
  prepare(sql) { return new Statement(this._db, sql); }
  transaction(fn) {
    return (...args) => {
      this._db.exec('BEGIN');
      try {
        const out = fn(...args);
        this._db.exec('COMMIT');
        return out;
      } catch (e) {
        try { this._db.exec('ROLLBACK'); } catch {}
        throw e;
      }
    };
  }
  close() { try { this._db.close(); } catch {} }
}

module.exports = Database;
