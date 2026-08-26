const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isRealSupabase =
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your-project') &&
  !supabaseUrl.includes('example.com') &&
  supabaseUrl.startsWith('https://');

let client = null;

if (isRealSupabase) {
  try {
    console.log('🌐 Connected to Cloud Supabase PostgreSQL:', supabaseUrl);
    client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch (err) {
    console.warn('⚠️ Supabase client init failed, switching to local DB engine:', err.message);
  }
}

if (!client) {
  console.log('⚡ Running with Built-in Local Database Engine (Zero-Config Out-of-the-Box Mode)');
  console.log('   (To use Cloud Supabase, add your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env)\n');

  const dbDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbFile = path.join(dbDir, 'local_db.json');

  let memoryDB = null;

  function loadDB() {
    if (memoryDB) return memoryDB;
    try {
      if (fs.existsSync(dbFile)) {
        const content = fs.readFileSync(dbFile, 'utf8').trim();
        if (content) {
          memoryDB = JSON.parse(content);
          return memoryDB;
        }
      }
    } catch (e) {
      console.error('Error reading local DB file, initializing fresh:', e.message);
    }
    memoryDB = {
      organizers: [],
      events: [],
      attendees: [],
      checkins: [],
      invalid_scan_logs: [],
    };
    return memoryDB;
  }

  function saveDB(db) {
    memoryDB = db;
    try {
      const tmpFile = dbFile + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmpFile, dbFile);
    } catch (e) {
      try {
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
      } catch (err) {
        console.error('Error saving local DB file:', err.message);
      }
    }
  }

  // Ensure DB initialized with default tables
  saveDB(loadDB());

  class LocalQueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.orFilters = [];
      this.orders = [];
      this._limit = null;
      this._range = null;
      this._single = false;
      this._selectFields = '*';
      this._countMode = null;
      this._op = 'select'; // 'select' | 'insert' | 'upsert' | 'update' | 'delete'
      this._payload = null;
      this._upsertOptions = null;
    }

    select(fields = '*', options = {}) {
      this._selectFields = fields;
      if (options && options.count === 'exact') {
        this._countMode = options.head ? 'head' : 'exact';
      }
      return this;
    }

    insert(payload) {
      this._op = 'insert';
      this._payload = payload;
      return this;
    }

    upsert(payload, options = {}) {
      this._op = 'upsert';
      this._payload = payload;
      this._upsertOptions = options;
      return this;
    }

    update(updates) {
      this._op = 'update';
      this._payload = updates;
      return this;
    }

    delete() {
      this._op = 'delete';
      return this;
    }

    eq(field, value) {
      this.filters.push((row) => row[field] === value);
      return this;
    }

    neq(field, value) {
      this.filters.push((row) => row[field] !== value);
      return this;
    }

    is(field, value) {
      this.filters.push((row) => row[field] === value || (value === null && (row[field] === null || row[field] === undefined || (Array.isArray(row[field]) && row[field].length === 0))));
      return this;
    }

    not(field, op, value) {
      if (op === 'is' && value === null) {
        this.filters.push((row) => row[field] !== null && row[field] !== undefined && (!Array.isArray(row[field]) || row[field].length > 0));
      }
      return this;
    }

    or(expression) {
      const parts = expression.split(',');
      const orFns = parts.map((part) => {
        const [field, op, term] = part.split('.');
        const cleanTerm = (term || '').replace(/%/g, '').toLowerCase();
        return (row) => {
          const val = (row[field] || '').toString().toLowerCase();
          return val.includes(cleanTerm);
        };
      });
      this.orFilters.push((row) => orFns.some((fn) => fn(row)));
      return this;
    }

    order(field, { ascending = true } = {}) {
      this.orders.push({ field, ascending });
      return this;
    }

    range(start, end) {
      this._range = { start, end };
      return this;
    }

    limit(n) {
      this._limit = n;
      return this;
    }

    single() {
      this._single = true;
      return this;
    }

    _applyFilters(rows) {
      let result = [...rows];
      for (const fn of this.filters) {
        result = result.filter(fn);
      }
      for (const fn of this.orFilters) {
        result = result.filter(fn);
      }
      return result;
    }

    _applyOrder(rows) {
      let result = [...rows];
      for (const { field, ascending } of this.orders) {
        result.sort((a, b) => {
          const va = a[field] ?? '';
          const vb = b[field] ?? '';
          if (va < vb) return ascending ? -1 : 1;
          if (va > vb) return ascending ? 1 : -1;
          return 0;
        });
      }
      return result;
    }

    _populateRelations(row, db) {
      const copy = { ...row };

      if (this.table === 'events') {
        const attCount = (db.attendees || []).filter((a) => a.event_id === row.id).length;
        const ciCount = (db.checkins || []).filter((c) => c.event_id === row.id).length;
        copy.attendees = [{ count: attCount }];
        copy.checkins = [{ count: ciCount }];
      } else if (this.table === 'attendees') {
        copy.checkins = (db.checkins || [])
          .filter((c) => c.attendee_id === row.id)
          .map((c) => ({
            id: c.id,
            entry_point: c.entry_point,
            checked_in_at: c.checked_in_at,
          }));
      } else if (this.table === 'checkins') {
        const att = (db.attendees || []).find((a) => a.id === row.attendee_id);
        copy.attendees = att ? { id: att.id, name: att.name, email: att.email } : null;
      }

      return copy;
    }

    async _execute() {
      const db = loadDB();
      if (!db[this.table]) db[this.table] = [];

      if (this._op === 'insert') {
        const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
        const inserted = [];

        for (const raw of rows) {
          const item = {
            id: raw.id || crypto.randomUUID(),
            ...raw,
            created_at: raw.created_at || new Date().toISOString(),
          };

          // Enforce unique constraints
          if (this.table === 'organizers') {
            if (db.organizers.some((o) => o.email.toLowerCase() === (item.email || '').toLowerCase())) {
              const err = new Error('duplicate key value violates unique constraint');
              err.code = '23505';
              return { data: null, error: err };
            }
          } else if (this.table === 'checkins') {
            item.checked_in_at = item.checked_in_at || new Date().toISOString();
            const exists = db.checkins.some(
              (c) => c.event_id === item.event_id && c.attendee_id === item.attendee_id
            );
            if (exists) {
              const err = new Error('duplicate key value violates unique constraint "uq_checkin_per_event_attendee"');
              err.code = '23505';
              return { data: null, error: err };
            }
          } else if (this.table === 'attendees') {
            const exists = db.attendees.some(
              (a) => a.event_id === item.event_id && (a.email || '').toLowerCase() === (item.email || '').toLowerCase()
            );
            if (exists) {
              const err = new Error('duplicate attendee email for this event');
              err.code = '23505';
              return { data: null, error: err };
            }
          }

          db[this.table].push(item);
          inserted.push(item);
        }

        saveDB(db);
        const data = this._single ? (inserted[0] || null) : (Array.isArray(this._payload) ? inserted : inserted[0]);
        return { data, error: null };
      }

      if (this._op === 'upsert') {
        const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
        const upserted = [];
        const options = this._upsertOptions || {};

        for (const raw of rows) {
          const onConflictFields = (options.onConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
          let existingIndex = -1;

          if (onConflictFields.length > 0) {
            existingIndex = db[this.table].findIndex((item) =>
              onConflictFields.every((field) => (item[field] || '').toString().toLowerCase() === (raw[field] || '').toString().toLowerCase())
            );
          }

          if (existingIndex >= 0) {
            if (!options.ignoreDuplicates) {
              db[this.table][existingIndex] = { ...db[this.table][existingIndex], ...raw };
              upserted.push(db[this.table][existingIndex]);
            }
          } else {
            const item = {
              id: raw.id || crypto.randomUUID(),
              ...raw,
              created_at: raw.created_at || new Date().toISOString(),
            };
            db[this.table].push(item);
            upserted.push(item);
          }
        }

        saveDB(db);
        return { data: upserted, error: null };
      }

      if (this._op === 'update') {
        let matched = this._applyFilters(db[this.table]);
        const updated = [];

        for (const item of matched) {
          const idx = db[this.table].findIndex((r) => r.id === item.id);
          if (idx >= 0) {
            db[this.table][idx] = {
              ...db[this.table][idx],
              ...this._payload,
              updated_at: new Date().toISOString(),
            };
            updated.push(db[this.table][idx]);
          }
        }

        saveDB(db);
        const data = this._single ? (updated[0] || null) : updated;
        return { data, error: null };
      }

      if (this._op === 'delete') {
        const matched = this._applyFilters(db[this.table]);
        const matchedIds = new Set(matched.map((m) => m.id));

        db[this.table] = db[this.table].filter((r) => !matchedIds.has(r.id));

        // Cascade deletes for events
        if (this.table === 'events') {
          db.attendees = db.attendees.filter((a) => !matchedIds.has(a.event_id));
          db.checkins = db.checkins.filter((c) => !matchedIds.has(c.event_id));
          db.invalid_scan_logs = db.invalid_scan_logs.filter((l) => !matchedIds.has(l.event_id));
        }

        saveDB(db);
        return { data: matched, error: null };
      }

      // SELECT
      let filtered = this._applyFilters(db[this.table] || []);
      const count = filtered.length;

      if (this._countMode === 'head') {
        return { count, data: null, error: null };
      }

      filtered = this._applyOrder(filtered);

      if (this._range) {
        filtered = filtered.slice(this._range.start, this._range.end + 1);
      } else if (this._limit) {
        filtered = filtered.slice(0, this._limit);
      }

      let populated = filtered.map((r) => this._populateRelations(r, db));

      if (this._single) {
        const item = populated[0] || null;
        return { data: item, error: item ? null : { message: 'Row not found' }, count };
      }

      return { data: populated, error: null, count };
    }

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }

    catch(reject) {
      return this._execute().catch(reject);
    }
  }

  client = {
    from: (table) => new LocalQueryBuilder(table),
    channel: (name) => ({
      on: () => ({ subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); } }),
      subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); },
    }),
    removeChannel: () => {},
  };
}

module.exports = client;
