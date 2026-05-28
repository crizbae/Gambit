// ============================================================
// Gambit Stats Store
//
// In-memory stats store, disk/DB persistence, score formulas,
// leaderboard sorting, and the shared stat card display function.
//
// Depends on: gambit_db.js (gambitDb* functions, loads at g-d before g-s)
//
// Globals shared with other files: stats, roundStats, statsDirty
// ============================================================

var PD_DAMAGE          = 'gambit_stats_damage';
var PD_KILLS           = 'gambit_stats_kills';
var PD_DEATHS          = 'gambit_stats_deaths';
var PD_MATCHES         = 'gambit_stats_matches';
var PD_WINS            = 'gambit_stats_wins';
var PD_MVPS            = 'gambit_stats_mvps';
var PD_DOWNS           = 'gambit_downs';
var PD_ASSISTS         = 'gambit_stats_assists';
var PD_LONGEST_STREAK  = 'gambit_stats_longest_streak';
var PD_REVIVES         = 'gambit_stats_revives';
var PD_ELIM_SCORE      = 'gambit_stats_elim_score';
var PD_ELIM_MATCHES    = 'gambit_stats_elim_matches';
var PD_ELIM_KILLS      = 'gambit_stats_elim_kills';
var PD_ELIM_DEATHS     = 'gambit_stats_elim_deaths';
var PD_TDM_SCORE       = 'gambit_stats_tdm_score';
var PD_TDM_MATCHES     = 'gambit_stats_tdm_matches';
var PD_TDM_KILLS       = 'gambit_stats_tdm_kills';
var PD_TDM_DEATHS      = 'gambit_stats_tdm_deaths';

var LEADERBOARD_MIN_MATCHES_MODE = 3;
var LEADERBOARD_MIN_MATCHES      = 10;
var STATS_FLUSH_INTERVAL_TICKS   = 200;
var STATS_FILE_PATH              = 'kubejs/data/gambit_stats.json';
var DEV_CONFIG_PATH              = 'kubejs/data/gambit_dev_config.json';

// ── In-memory stat store ─────────────────────────────────────
var stats     = {};
var roundStats = {};
var statsDirty = false;
var statsSaveTicker = 0;
var uuidByName  = {}; // { lowerCaseName: uuid } — reverse lookup, populated by loadEntryFromPlayer

// Returns true if key looks like a Minecraft UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
function isUuidKey(key) {
  if (typeof key !== 'string' || key.length !== 36) return false;
  return key.charAt(8) === '-' && key.charAt(13) === '-' && key.charAt(18) === '-' && key.charAt(23) === '-';
}

// ── Stat tracking gate ───────────────────────────────────────
// When false, no lifetime stats are written or persisted.
// roundStats still accumulates so postgame displays work.
// Persisted in gambit_dev_config.json so the setting survives restarts.
// Toggled by /stats admin tracking on|off.
var statsTrackingEnabled = (function() {
  try {
    var _cfg = JsonIO.read(DEV_CONFIG_PATH);
    if (_cfg && typeof _cfg.stats_tracking !== 'undefined') return !!_cfg.stats_tracking;
  } catch (_e) {}
  return true; // default on
})();

function gambitShouldTrackNormalStats() {
  if (typeof tournamentMode !== 'undefined' && tournamentMode) return false;
  return (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled);
}

function gambitShouldTrackSessionStats() {
  if (!gambitShouldTrackNormalStats()) return false;
  if (typeof gambitDbIsEnabled !== 'function' || !gambitDbIsEnabled()) return false;
  if (typeof gambitDbGetActiveSessionId !== 'function') return false;
  return gambitDbGetActiveSessionId() !== null;
}

function _saveDevConfig() {
  try {
    var _cfg = {};
    try { _cfg = JsonIO.read(DEV_CONFIG_PATH) || {}; } catch (_re) {}
    _cfg.stats_tracking = statsTrackingEnabled;
    JsonIO.write(DEV_CONFIG_PATH, _cfg);
  } catch (_e) {
    console.error('[Gambit Dev] Failed to save dev config: ' + _e);
  }
}

// Staging var: set to 'red'/'blue' by applyMatchResult(addWin=true), consumed by broadcastPostGameScoreboard
var pendingHistoryWinner = null;

// ── Entry helpers ────────────────────────────────────────────
var PD_SESSION = 'gambit_stats_session';

var MATCH_HISTORY_MAX = 5;

function getTodayDateString() {
  try {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return y + '-' + m + '-' + day;
  } catch(e) { return ''; }
}

var lastSessionResetDate = getTodayDateString();

function rolloverSessionStatsIfNeeded() {
  var today = getTodayDateString();
  if (!today || today === lastSessionResetDate) return;

  var keys = Object.keys(stats);
  var changed = 0;
  for (var i = 0; i < keys.length; i++) {
    var entry = stats[keys[i]];
    if (!entry) continue;
    if (entry.session && entry.session.date === today) continue;
    entry.session = makeDefaultSession();
    changed += 1;
  }

  lastSessionResetDate = today;
  if (changed > 0) markStatsDirty();
}

function makeDefaultSession() {
  return { date: getTodayDateString(), kills: 0, deaths: 0, damage: 0.0, matches: 0, wins: 0, assists: 0, mvps: 0,
           elim_kills: 0, elim_deaths: 0, elim_matches: 0, elim_damage: 0.0, elim_assists: 0, elim_mvps: 0,
           tdm_kills: 0, tdm_deaths: 0, tdm_matches: 0, tdm_damage: 0.0, tdm_assists: 0, tdm_mvps: 0,
           longest_streak: 0, revives: 0 };
}

function makeDefaultEntry() {
  return { name: '', damage: 0.0, kills: 0, deaths: 0, matches: 0, wins: 0, mvps: 0, assists: 0, longest_streak: 0, revives: 0,
           elim_score_total: 0.0, elim_matches: 0, elim_kills: 0, elim_deaths: 0,
           tdm_score_total: 0.0, tdm_matches: 0, tdm_kills: 0, tdm_deaths: 0,
           match_history: [], session: makeDefaultSession() };
}

function normalizeMatchHistory(rawHistory) {
  var out = [];
  if (!rawHistory) return out;

  // Plain JS arrays
  if (Array.isArray(rawHistory)) {
    var lim = Math.min(MATCH_HISTORY_MAX, rawHistory.length);
    for (var ai = 0; ai < lim; ai++) {
      var ar = rawHistory[ai];
      if (ar) out.push(ar);
    }
    return out;
  }

  // Java arrays / lists from JsonIO can expose length/size/get differently.
  var len = 0;
  try {
    if (typeof rawHistory.size === 'function') len = Math.floor(Number(rawHistory.size()) || 0);
    else if (typeof rawHistory.length === 'number') len = Math.floor(Number(rawHistory.length) || 0);
  } catch (e) { len = 0; }

  if (len <= 0) return out;

  var max = Math.min(MATCH_HISTORY_MAX, len);
  for (var i = 0; i < max; i++) {
    var r = null;
    try {
      if (typeof rawHistory.get === 'function') r = rawHistory.get(i);
      else r = rawHistory[i];
    } catch (_mhErr) {
      // Stop on the first invalid index access from Java-backed containers.
      break;
    }
    if (r) out.push(r);
  }

  return out;
}

function normalizeEntry(raw) {
  var base = makeDefaultEntry();
  if (!raw) return base;
  base.name           = String(raw.name || '');

  base.damage         = Number(raw.damage || 0.0);
  base.kills          = Math.floor(Number(raw.kills || 0));
  base.deaths         = Math.floor(Number(raw.deaths || 0));
  base.matches        = Math.floor(Number(raw.matches || 0));
  base.wins           = Math.floor(Number(raw.wins || 0));
  base.mvps           = Math.floor(Number(raw.mvps || 0));
  base.assists        = Math.floor(Number(raw.assists || 0));
  base.longest_streak = Math.floor(Number(raw.longest_streak || 0));
  base.revives        = Math.floor(Number(raw.revives || 0));

  if (Number.isNaN(base.damage))         base.damage = 0.0;
  if (Number.isNaN(base.kills))          base.kills = 0;
  if (Number.isNaN(base.deaths))         base.deaths = 0;
  if (Number.isNaN(base.matches))        base.matches = 0;
  if (Number.isNaN(base.wins))           base.wins = 0;
  if (Number.isNaN(base.mvps))           base.mvps = 0;
  if (Number.isNaN(base.assists))        base.assists = 0;
  if (Number.isNaN(base.longest_streak)) base.longest_streak = 0;
  if (Number.isNaN(base.revives))        base.revives = 0;

  base.elim_score_total = Number(raw.elim_score_total || 0.0);
  base.elim_matches     = Math.floor(Number(raw.elim_matches || 0));
  base.elim_kills       = Math.floor(Number(raw.elim_kills  || 0));
  base.elim_deaths      = Math.floor(Number(raw.elim_deaths || 0));
  base.tdm_score_total  = Number(raw.tdm_score_total || 0.0);
  base.tdm_matches      = Math.floor(Number(raw.tdm_matches || 0));
  base.tdm_kills        = Math.floor(Number(raw.tdm_kills   || 0));
  base.tdm_deaths       = Math.floor(Number(raw.tdm_deaths  || 0));
  if (Number.isNaN(base.elim_score_total)) base.elim_score_total = 0.0;
  if (Number.isNaN(base.elim_matches))     base.elim_matches = 0;
  if (Number.isNaN(base.elim_kills))       base.elim_kills = 0;
  if (Number.isNaN(base.elim_deaths))      base.elim_deaths = 0;
  if (Number.isNaN(base.tdm_score_total))  base.tdm_score_total = 0.0;
  if (Number.isNaN(base.tdm_matches))      base.tdm_matches = 0;
  if (Number.isNaN(base.tdm_kills))        base.tdm_kills = 0;
  if (Number.isNaN(base.tdm_deaths))       base.tdm_deaths = 0;

  // Copy match history defensively (JsonIO may return Java-backed containers).
  base.match_history = normalizeMatchHistory(raw.match_history);

  // Session: reset if date has changed, otherwise carry forward
  var today = getTodayDateString();
  var rawSession = raw.session;
  if (rawSession && rawSession.date === today) {
    base.session = {
      date:           today,
      kills:          Math.floor(Number(rawSession.kills          || 0)),
      deaths:         Math.floor(Number(rawSession.deaths         || 0)),
      damage:         Number(rawSession.damage  || 0.0),
      matches:        Math.floor(Number(rawSession.matches        || 0)),
      wins:           Math.floor(Number(rawSession.wins           || 0)),
      assists:        Math.floor(Number(rawSession.assists        || 0)),
      mvps:           Math.floor(Number(rawSession.mvps           || 0)),
      elim_kills:     Math.floor(Number(rawSession.elim_kills     || 0)),
      elim_deaths:    Math.floor(Number(rawSession.elim_deaths    || 0)),
      elim_matches:   Math.floor(Number(rawSession.elim_matches   || 0)),
      elim_damage:    Number(rawSession.elim_damage || 0.0),
      elim_assists:   Math.floor(Number(rawSession.elim_assists   || 0)),
      elim_mvps:      Math.floor(Number(rawSession.elim_mvps      || 0)),
      tdm_kills:      Math.floor(Number(rawSession.tdm_kills      || 0)),
      tdm_deaths:     Math.floor(Number(rawSession.tdm_deaths     || 0)),
      tdm_matches:    Math.floor(Number(rawSession.tdm_matches    || 0)),
      tdm_damage:     Number(rawSession.tdm_damage || 0.0),
      tdm_assists:    Math.floor(Number(rawSession.tdm_assists    || 0)),
      tdm_mvps:       Math.floor(Number(rawSession.tdm_mvps       || 0)),
      longest_streak: Math.floor(Number(rawSession.longest_streak || 0)),
      revives:        Math.floor(Number(rawSession.revives        || 0))
    };
  } else {
    base.session = makeDefaultSession();
  }

  return base;
}

function markStatsDirty() {
  statsDirty = true;
}

function getEntry(key) {
  if (!key) { var _nk = makeDefaultEntry(); return _nk; }
  // Direct hit (UUID-keyed or legacy name-keyed)
  if (stats[key]) return stats[key];
  // Resolve by name → UUID via reverse index (populated after loadEntryFromPlayer)
  var _uuid = uuidByName[String(key).toLowerCase()];
  if (_uuid && stats[_uuid]) return stats[_uuid];
  // Create new entry keyed by name (legacy; migrated to UUID on next login)
  stats[key] = makeDefaultEntry();
  stats[key].name = String(key);
  return stats[key];
}

function getRoundEntry(playerName) {
  if (!roundStats[playerName]) roundStats[playerName] = { damage: 0.0, kills: 0, deaths: 0, assists: 0 };
  return roundStats[playerName];
}

function clearRoundStats() {
  roundStats = {};
}

function resetPlayerSession(playerName) {
  if (!playerName) return false;
  var entry = getEntry(playerName);
  if (!entry) return false;
  entry.session = makeDefaultSession();
  markStatsDirty();
  return true;
}

function resetAllSessionStats(server) {
  var keys = Object.keys(stats);
  for (var i = 0; i < keys.length; i++) {
    if (stats[keys[i]]) stats[keys[i]].session = makeDefaultSession();
  }

  if (server && server.players) {
    server.players.forEach(function(p) {
      loadEntryFromPlayer(p);
      var uuid = String(p.uuid);
      if (stats[uuid]) {
        stats[uuid].session = makeDefaultSession();
        saveEntryToPlayer(p);
      }
    });
  }

  markStatsDirty();
}

// ── Match history ─────────────────────────────────────────────
// Called once per player at match end with their round stats + outcome.
// { map, mode, kills, deaths, damage, won }
function pushMatchHistory(playerName, mapName, modeName, roundEntry, won) {
  if (!playerName || !mapName) return;
  var entry = getEntry(playerName);
  if (!entry.match_history) entry.match_history = [];
  var record = {
    map:    mapName,
    mode:   modeName,
    kills:  (roundEntry && roundEntry.kills)  ? Math.floor(roundEntry.kills)          : 0,
    deaths: (roundEntry && roundEntry.deaths) ? Math.floor(roundEntry.deaths)         : 0,
    damage: (roundEntry && roundEntry.damage) ? Math.floor(roundEntry.damage * 10) / 10 : 0.0,
    won:    won ? true : false
  };
  entry.match_history.unshift(record); // newest first
  if (entry.match_history.length > MATCH_HISTORY_MAX) {
    entry.match_history = entry.match_history.slice(0, MATCH_HISTORY_MAX);
  }
  markStatsDirty();
}

// ── NBT tag I/O ──────────────────────────────────────────────
function readTagNumber(tag, key, fallback) {
  if (!tag) return fallback;
  try {
    if (tag.contains && tag.contains(key)) {
      if (tag.getDouble) return Number(tag.getDouble(key));
      if (tag.getFloat)  return Number(tag.getFloat(key));
      if (tag.getInt)    return Number(tag.getInt(key));
    }
  } catch (e) {}
  try {
    if (tag[key] !== undefined) return Number(tag[key]);
  } catch (e) {}
  return fallback;
}

function writeTagNumber(tag, key, value, integerOnly) {
  if (!tag) return;
  var n = Number(value);
  if (Number.isNaN(n)) n = 0;
  try {
    if (integerOnly && tag.putInt)    { tag.putInt(key, Math.floor(n)); return; }
    if (!integerOnly && tag.putDouble) { tag.putDouble(key, n); return; }
  } catch (e) {}
  try { tag[key] = integerOnly ? Math.floor(n) : n; } catch (e) {}
}

// ── Player ↔ NBT sync ────────────────────────────────────────
function loadEntryFromPlayer(player) {
  if (!player) return;
  var name = player.name && player.name.string ? player.name.string : null;
  if (!name) return;
  var uuid      = String(player.uuid);
  var nameLower = name.toLowerCase();
  // Migrate any legacy name-keyed entry to this player's UUID slot
  if (!stats[uuid]) {
    var _legacyKeys = Object.keys(stats);
    for (var _lki = 0; _lki < _legacyKeys.length; _lki++) {
      var _lk = _legacyKeys[_lki];
      if (!isUuidKey(_lk) && String(_lk).toLowerCase() === nameLower) {
        stats[uuid] = stats[_lk];
        delete stats[_lk];
        break;
      }
    }
  }
  var tag   = player.persistentData;
  var entry = getEntry(uuid);
  // Update display name and keep reverse index current
  var _prevName = entry.name;
  if (_prevName && _prevName.toLowerCase() !== nameLower) delete uuidByName[_prevName.toLowerCase()];
  entry.name = name;
  uuidByName[nameLower] = uuid;
  entry.damage         = readTagNumber(tag, PD_DAMAGE, 0.0);
  entry.kills          = Math.floor(readTagNumber(tag, PD_KILLS, 0));
  entry.deaths         = Math.floor(readTagNumber(tag, PD_DEATHS, 0));
  entry.matches        = Math.floor(readTagNumber(tag, PD_MATCHES, 0));
  entry.wins           = Math.floor(readTagNumber(tag, PD_WINS, 0));
  entry.mvps           = Math.floor(readTagNumber(tag, PD_MVPS, 0));
  entry.assists        = Math.floor(readTagNumber(tag, PD_ASSISTS, 0));
  entry.longest_streak = Math.floor(readTagNumber(tag, PD_LONGEST_STREAK, 0));
  entry.revives        = Math.floor(readTagNumber(tag, PD_REVIVES, 0));
  entry.elim_score_total = readTagNumber(tag, PD_ELIM_SCORE, 0.0);
  entry.elim_matches     = Math.floor(readTagNumber(tag, PD_ELIM_MATCHES, 0));
  entry.tdm_score_total  = readTagNumber(tag, PD_TDM_SCORE, 0.0);
  entry.tdm_matches      = Math.floor(readTagNumber(tag, PD_TDM_MATCHES, 0));
  entry.elim_kills       = Math.floor(readTagNumber(tag, PD_ELIM_KILLS,  0));
  entry.elim_deaths      = Math.floor(readTagNumber(tag, PD_ELIM_DEATHS, 0));
  entry.tdm_kills        = Math.floor(readTagNumber(tag, PD_TDM_KILLS,   0));
  entry.tdm_deaths       = Math.floor(readTagNumber(tag, PD_TDM_DEATHS,  0));
  // Session: stored as JSON string in NBT
  try {
    var rawSess = null;
    if (tag && tag.getString) rawSess = tag.getString(PD_SESSION);
    else if (tag && tag[PD_SESSION] !== undefined) rawSess = String(tag[PD_SESSION]);
    if (rawSess) {
      var parsedSess = JSON.parse(rawSess);
      var today = getTodayDateString();
      if (parsedSess && parsedSess.date === today) {
        entry.session = {
          date:           today,
          kills:          Math.floor(Number(parsedSess.kills          || 0)),
          deaths:         Math.floor(Number(parsedSess.deaths         || 0)),
          damage:         Number(parsedSess.damage  || 0.0),
          matches:        Math.floor(Number(parsedSess.matches        || 0)),
          wins:           Math.floor(Number(parsedSess.wins           || 0)),
          assists:        Math.floor(Number(parsedSess.assists        || 0)),
          mvps:           Math.floor(Number(parsedSess.mvps           || 0)),
          elim_kills:     Math.floor(Number(parsedSess.elim_kills     || 0)),
          elim_deaths:    Math.floor(Number(parsedSess.elim_deaths    || 0)),
          elim_matches:   Math.floor(Number(parsedSess.elim_matches   || 0)),
          elim_damage:    Number(parsedSess.elim_damage || 0.0),
          elim_assists:   Math.floor(Number(parsedSess.elim_assists   || 0)),
          elim_mvps:      Math.floor(Number(parsedSess.elim_mvps      || 0)),
          tdm_kills:      Math.floor(Number(parsedSess.tdm_kills      || 0)),
          tdm_deaths:     Math.floor(Number(parsedSess.tdm_deaths     || 0)),
          tdm_matches:    Math.floor(Number(parsedSess.tdm_matches    || 0)),
          tdm_damage:     Number(parsedSess.tdm_damage || 0.0),
          tdm_assists:    Math.floor(Number(parsedSess.tdm_assists    || 0)),
          tdm_mvps:       Math.floor(Number(parsedSess.tdm_mvps       || 0)),
          longest_streak: Math.floor(Number(parsedSess.longest_streak || 0)),
          revives:        Math.floor(Number(parsedSess.revives        || 0))
        };
      } else {
        entry.session = makeDefaultSession();
      }
    }
  } catch(_se) { entry.session = makeDefaultSession(); }
}

function saveEntryToPlayer(player) {
  if (!player) return;
  var name = player.name && player.name.string ? player.name.string : null;
  if (!name) return;
  var uuid  = String(player.uuid);
  var tag   = player.persistentData;
  var entry = getEntry(uuid);
  writeTagNumber(tag, PD_DAMAGE,         entry.damage,                false);
  writeTagNumber(tag, PD_KILLS,          entry.kills,                 true);
  writeTagNumber(tag, PD_DEATHS,         entry.deaths,                true);
  writeTagNumber(tag, PD_MATCHES,        entry.matches,               true);
  writeTagNumber(tag, PD_WINS,           entry.wins,                  true);
  writeTagNumber(tag, PD_MVPS,           entry.mvps,                  true);
  writeTagNumber(tag, PD_ASSISTS,        entry.assists || 0,          true);
  writeTagNumber(tag, PD_LONGEST_STREAK, entry.longest_streak || 0,   true);
  writeTagNumber(tag, PD_REVIVES,        entry.revives || 0,          true);
  writeTagNumber(tag, PD_ELIM_SCORE,     entry.elim_score_total || 0.0, false);
  writeTagNumber(tag, PD_ELIM_MATCHES,   entry.elim_matches || 0,     true);
  writeTagNumber(tag, PD_TDM_SCORE,      entry.tdm_score_total || 0.0, false);
  writeTagNumber(tag, PD_TDM_MATCHES,    entry.tdm_matches || 0,      true);
  writeTagNumber(tag, PD_ELIM_KILLS,     entry.elim_kills  || 0,      true);
  writeTagNumber(tag, PD_ELIM_DEATHS,    entry.elim_deaths || 0,      true);
  writeTagNumber(tag, PD_TDM_KILLS,      entry.tdm_kills   || 0,      true);
  writeTagNumber(tag, PD_TDM_DEATHS,     entry.tdm_deaths  || 0,      true);
  // Session: store as JSON string
  try {
    var sessJson = JSON.stringify(entry.session || makeDefaultSession());
    if (tag && tag.putString) tag.putString(PD_SESSION, sessJson);
    else if (tag) tag[PD_SESSION] = sessJson;
  } catch(_se) {}
  markStatsDirty();
}

function clearEntryForPlayer(player) {
  if (!player) return;
  var name = player.name && player.name.string ? player.name.string : null;
  if (!name) return;
  var uuid = String(player.uuid);
  stats[uuid] = makeDefaultEntry();
  stats[uuid].name = name;
  uuidByName[name.toLowerCase()] = uuid;
  saveEntryToPlayer(player);
}

function loadOnlinePlayersIntoStats(server) {
  if (!server || !server.players) return;
  server.players.forEach(function(p) { loadEntryFromPlayer(p); });
}

// ── Score formulas ────────────────────────────────────────────
function getKD(e) {
  if (!e) return 0;
  return e.kills / Math.max(1, e.deaths);
}

function getElimKD(e) {
  if (!e) return 0;
  var ek = e.elim_kills || 0;
  var ed = e.elim_deaths || 0;
  if (ek === 0 && ed === 0) return getKD(e); // fall back to overall until mode data exists
  return ek / Math.max(1, ed);
}

function getTdmKD(e) {
  if (!e) return 0;
  var tk = e.tdm_kills || 0;
  var td = e.tdm_deaths || 0;
  if (tk === 0 && td === 0) return getKD(e); // fall back to overall until mode data exists
  return tk / Math.max(1, td);
}

function getCombinedKD(e) {
  if (!e) return 0;
  var k = (e.elim_kills || 0) + (e.tdm_kills || 0);
  var d = (e.elim_deaths || 0) + (e.tdm_deaths || 0);
  if (k === 0 && d === 0) return getKD(e); // fall back to overall until mode data exists
  return k / Math.max(1, d);
}

function getWinPct(e) {
  if (!e) return 0;
  return (e.wins * 100) / Math.max(1, e.matches);
}

function getAvgDamagePerLife(e) {
  if (!e) return 0;
  return e.damage / Math.max(1, e.deaths);
}

function getCompositeScore(e) {
  if (!e) return 0;
  var kd           = getKD(e);
  var winRate      = getWinPct(e) / 100;
  var killsPerMatch = e.kills / Math.max(1, e.matches);
  var mvpsPerMatch  = (e.mvps || 0) / Math.max(1, e.matches);
  return (kd * 0.4) + (winRate * 0.3) + (killsPerMatch * 0.2) + (mvpsPerMatch * 0.1);
}

function getElimAvgScore(e) {
  if (!e || (e.elim_matches || 0) === 0) return 0;
  return e.elim_score_total / e.elim_matches;
}

function getTdmAvgScore(e) {
  if (!e || (e.tdm_matches || 0) === 0) return 0;
  return e.tdm_score_total / e.tdm_matches;
}

function getCombinedAvgScore(e) {
  if (!e) return 0;
  var totalMatches = (e.elim_matches || 0) + (e.tdm_matches || 0);
  if (totalMatches === 0) return 0;
  return ((e.elim_score_total || 0) + (e.tdm_score_total || 0)) / totalMatches;
}

// Score = (0.5 * damage) + (100 * kills) + (50 * assists) + (300 if MVP)
function calcElimMatchScore(rs, isMvp) {
  return (0.5 * (rs.damage || 0)) + (100 * (rs.kills || 0)) + (50 * (rs.assists || 0)) + (isMvp ? 300 : 0);
}

// Score = (0.25 * damage) + (100 * kills) + (50 * assists) - (100 * deaths) + (500 if MVP)
function calcTdmMatchScore(rs, isMvp) {
  return (0.25 * (rs.damage || 0)) + (100 * (rs.kills || 0)) + (50 * (rs.assists || 0)) - (100 * (rs.deaths || 0)) + (isMvp ? 500 : 0);
}

// ── Lookup helpers ────────────────────────────────────────────
function getOnlinePlayerByName(server, playerName) {
  if (!server || !server.players || !playerName) return null;
  var lower = String(playerName).toLowerCase();
  var found = null;

  function checkPlayer(p) {
    if (found || !p) return;
    var n = p.name && p.name.string ? String(p.name.string).toLowerCase() : '';
    if (n === lower) found = p;
  }

  try {
    if (server.players.forEach) {
      server.players.forEach(function(p) { checkPlayer(p); });
      if (found) return found;
    }
  } catch (_forEachErr) {}

  try {
    if (typeof server.players.length === 'number') {
      for (var i = 0; i < server.players.length; i++) checkPlayer(server.players[i]);
      if (found) return found;
    }
  } catch (_lengthErr) {}

  try {
    if (server.players.size && server.players.get) {
      var size = server.players.size();
      for (var j = 0; j < size; j++) checkPlayer(server.players.get(j));
      if (found) return found;
    }
  } catch (_javaListErr) {}

  try {
    var iter = server.players.iterator ? server.players.iterator() : null;
    while (iter && iter.hasNext()) {
      checkPlayer(iter.next());
      if (found) return found;
    }
  } catch (_iterErr) {
  }
  return found;
}

function getExistingStatName(name) {
  if (!name) return null;
  var wanted = String(name).toLowerCase();
  // Fast path: reverse UUID index
  var _uuid = uuidByName[wanted];
  if (_uuid && stats[_uuid]) return _uuid;
  // Scan all entries — check stored name field, then fall back to key itself (legacy)
  var keys = Object.keys(stats);
  for (var i = 0; i < keys.length; i++) {
    var _se = stats[keys[i]];
    if (_se && String(_se.name || '').toLowerCase() === wanted) return keys[i];
    if (String(keys[i]).toLowerCase() === wanted) return keys[i];
  }
  return null;
}

// ── Match result application (addmatch / addwin) ──────────────
function applyMatchResult(server, targetArg, addMatch, addWin) {
  if (!server || !targetArg) return { count: 0, mode: null };

  // Respect stat tracking gate — this is called automatically from win mcfunctions
  // (stats/match_all, stats/win_red, stats/win_blue) as well as by OP commands.
  if (!gambitShouldTrackNormalStats()) return { count: 0, mode: null };

  var target = String(targetArg).toLowerCase();
  var mode = null;

  if (target === 'red' || target === 'blue' || target === 'all') {
    mode = target;
    var count = 0;
    server.players.forEach(function(p) {
      var onRed  = hasTagSafe(p, 'Red');
      var onBlue = hasTagSafe(p, 'Blue');
      if (target === 'red'  && !onRed)             return;
      if (target === 'blue' && !onBlue)            return;
      if (target === 'all'  && !(onRed || onBlue)) return;
      loadEntryFromPlayer(p);
      var e = getEntry(p.name.string);
      getRoundEntry(p.name.string);
      if (addMatch) e.matches += 1;
      if (addWin)   e.wins   += 1;
      if (gambitShouldTrackSessionStats()) {
        if (!e.session || e.session.date !== getTodayDateString()) e.session = makeDefaultSession();
        if (addMatch) {
          e.session.matches += 1;
          var _amMode = (typeof currentModeId !== 'undefined') ? currentModeId : -1;
          if (_amMode === 1) e.session.tdm_matches = (e.session.tdm_matches || 0) + 1;
          else               e.session.elim_matches = (e.session.elim_matches || 0) + 1;
        }
        if (addWin) e.session.wins += 1;
      }
      saveEntryToPlayer(p);
      count += 1;
    });
    if (addWin && (target === 'red' || target === 'blue')) pendingHistoryWinner = target;
    return { count: count, mode: mode };
  }

  var targetPlayer = getOnlinePlayerByName(server, targetArg);
  if (!targetPlayer) return { count: 0, mode: null };
  loadEntryFromPlayer(targetPlayer);
  var entry = getEntry(targetPlayer.name.string);
  getRoundEntry(targetPlayer.name.string);
  if (addMatch) entry.matches += 1;
  if (addWin)   entry.wins   += 1;
  if (gambitShouldTrackSessionStats()) {
    if (!entry.session || entry.session.date !== getTodayDateString()) entry.session = makeDefaultSession();
    if (addMatch) {
      entry.session.matches += 1;
      var _amMode = (typeof currentModeId !== 'undefined') ? currentModeId : -1;
      if (_amMode === 1) entry.session.tdm_matches = (entry.session.tdm_matches || 0) + 1;
      else               entry.session.elim_matches = (entry.session.elim_matches || 0) + 1;
    }
    if (addWin) entry.session.wins += 1;
  }
  saveEntryToPlayer(targetPlayer);
  return { count: 1, mode: 'player', playerName: targetPlayer.name.string, entry: entry };
}

// ── Metric helpers ────────────────────────────────────────────
function metricLabel(metric) {
  if (metric === 'kd')      return 'KD';
  if (metric === 'winpct')  return 'Win %';
  if (metric === 'damage')  return 'Damage';
  if (metric === 'kills')   return 'Kills';
  if (metric === 'deaths')  return 'Deaths';
  if (metric === 'wins')    return 'Wins';
  if (metric === 'matches') return 'Matches';
  if (metric === 'mvps')    return 'MVPs';
  if (metric === 'dpl')     return 'Damage per Life';
  if (metric === 'assists') return 'Assists';
  if (metric === 'streak')  return 'Longest Streak';
  if (metric === 'revives') return 'Revives';
  return null;
}

function metricValue(e, metric) {
  if (!e) return 0;
  if (metric === 'kd')      return getKD(e);
  if (metric === 'winpct')  return getWinPct(e);
  if (metric === 'damage')  return e.damage;
  if (metric === 'kills')   return e.kills;
  if (metric === 'deaths')  return e.deaths;
  if (metric === 'wins')    return e.wins;
  if (metric === 'matches') return e.matches;
  if (metric === 'mvps')    return e.mvps || 0;
  if (metric === 'dpl')     return getAvgDamagePerLife(e);
  if (metric === 'assists') return e.assists || 0;
  if (metric === 'streak')  return e.longest_streak || 0;
  if (metric === 'revives') return e.revives || 0;
  return NaN;
}

function formatMetricValue(value, metric) {
  if (metric === 'kd')     return Number(value).toFixed(2);
  if (metric === 'winpct') return Number(value).toFixed(1) + '%';
  if (metric === 'damage') return Number(value).toFixed(1);
  if (metric === 'dpl')    return Number(value).toFixed(1);
  return String(Math.floor(Number(value)));
}

// ── Sorted entry getters ──────────────────────────────────────
function getSortedEntriesByMetric(metric) {
  var keys = Object.keys(stats);
  var arr  = [];
  for (var i = 0; i < keys.length; i++) {
    var _smEntry = stats[keys[i]];
    if ((_smEntry.matches || 0) >= LEADERBOARD_MIN_MATCHES) {
      arr.push([_smEntry.name || keys[i], _smEntry]);
    }
  }
  arr.sort(function(a, b) {
    var primary = metricValue(b[1], metric) - metricValue(a[1], metric);
    if (primary !== 0) return primary;
    var kdDiff = getKD(b[1]) - getKD(a[1]);
    if (kdDiff !== 0) return kdDiff;
    return b[1].damage - a[1].damage;
  });
  return arr;
}

var SESSION_METRICS = ['kd','winpct','kills','deaths','damage','wins','matches','mvps','dpl','assists','streak','revives'];

function sessionMetricLabel(metric) {
  return metricLabel(metric);
}

function sessionMetricValue(s, metric) {
  if (!s) return 0;
  if (metric === 'kd')      return s.deaths > 0 ? s.kills / s.deaths : (s.kills || 0);
  if (metric === 'winpct')  return s.matches > 0 ? (s.wins * 100) / s.matches : 0;
  if (metric === 'damage')  return s.damage  || 0;
  if (metric === 'kills')   return s.kills   || 0;
  if (metric === 'deaths')  return s.deaths  || 0;
  if (metric === 'wins')    return s.wins    || 0;
  if (metric === 'matches') return s.matches || 0;
  if (metric === 'mvps')    return s.mvps    || 0;
  if (metric === 'dpl')     return s.deaths > 0 ? s.damage / s.deaths : (s.damage || 0);
  if (metric === 'assists') return s.assists || 0;
  if (metric === 'streak')  return s.longest_streak || 0;
  if (metric === 'revives') return s.revives || 0;
  return NaN;
}

function getDbActiveSessionEntriesIfAvailable() {
  if (typeof gambitDbIsEnabled !== 'function' || !gambitDbIsEnabled()) return null;
  if (typeof gambitDbGetActiveSessionEntries !== 'function') return null;
  return gambitDbGetActiveSessionEntries();
}

function getSortedEntriesBySessionMetric(metric) {
  var dbRows = getDbActiveSessionEntriesIfAvailable();
  if (dbRows !== null) {
    dbRows.sort(function(a, b) {
      var primary = sessionMetricValue(b[1], metric) - sessionMetricValue(a[1], metric);
      if (primary !== 0) return primary;
      return sessionMetricValue(b[1], 'kd') - sessionMetricValue(a[1], 'kd');
    });
    return dbRows;
  }

  var today = getTodayDateString();
  var keys  = Object.keys(stats);
  var arr   = [];
  for (var i = 0; i < keys.length; i++) {
    var s = stats[keys[i]].session;
    if (s && s.date === today && (s.matches || 0) > 0) arr.push([stats[keys[i]].name || keys[i], s]);
  }
  arr.sort(function(a, b) {
    var primary = sessionMetricValue(b[1], metric) - sessionMetricValue(a[1], metric);
    if (primary !== 0) return primary;
    return sessionMetricValue(b[1], 'kd') - sessionMetricValue(a[1], 'kd');
  });
  return arr;
}

function getSortedRoundEntries(metric) {
  var useMetric = metric || 'kills';
  var keys = Object.keys(roundStats);
  var arr  = [];
  for (var i = 0; i < keys.length; i++) {
    arr.push([keys[i], roundStats[keys[i]]]);
  }
  arr.sort(function(a, b) {
    if (useMetric === 'damage') {
      var primary = b[1].damage - a[1].damage;
      return primary !== 0 ? primary : b[1].kills - a[1].kills;
    }
    var primary = b[1].kills - a[1].kills;
    return primary !== 0 ? primary : b[1].damage - a[1].damage;
  });
  return arr;
}

function getSortedEntries() {
  var keys = Object.keys(stats);
  var arr  = [];
  for (var i = 0; i < keys.length; i++) {
    var _e = stats[keys[i]];
    if ((_e.elim_matches || 0) >= LEADERBOARD_MIN_MATCHES_MODE && (_e.tdm_matches || 0) >= LEADERBOARD_MIN_MATCHES_MODE) {
      arr.push([_e.name || keys[i], _e]);
    }
  }
  arr.sort(function(a, b) {
    var scoreDiff = getCombinedAvgScore(b[1]) - getCombinedAvgScore(a[1]);
    if (scoreDiff !== 0) return scoreDiff;
    var kdDiff = getCombinedKD(b[1]) - getCombinedKD(a[1]);
    if (kdDiff !== 0) return kdDiff;
    return getAvgDamagePerLife(b[1]) - getAvgDamagePerLife(a[1]);
  });
  return arr;
}

function getSortedEntriesByElimScore() {
  var keys = Object.keys(stats);
  var arr  = [];
  for (var i = 0; i < keys.length; i++) {
    var _esEntry = stats[keys[i]];
    if ((_esEntry.elim_matches || 0) >= LEADERBOARD_MIN_MATCHES_MODE) {
      arr.push([_esEntry.name || keys[i], _esEntry]);
    }
  }
  arr.sort(function(a, b) { return getElimAvgScore(b[1]) - getElimAvgScore(a[1]); });
  return arr;
}

function getSortedEntriesByTdmScore() {
  var keys = Object.keys(stats);
  var arr  = [];
  for (var i = 0; i < keys.length; i++) {
    var _tsEntry = stats[keys[i]];
    if ((_tsEntry.tdm_matches || 0) >= LEADERBOARD_MIN_MATCHES_MODE) {
      arr.push([_tsEntry.name || keys[i], _tsEntry]);
    }
  }
  arr.sort(function(a, b) { return getTdmAvgScore(b[1]) - getTdmAvgScore(a[1]); });
  return arr;
}

// Session score helpers — use mode-specific kill/death/damage/match counts
function _sessionElimScore(s) {
  var m = s.elim_matches || 0;
  if (m === 0) return 0;
  // Use mode-specific damage if available, fall back to total only for legacy sessions
  var dmg = (s.elim_damage > 0 || s.tdm_damage > 0) ? (s.elim_damage || 0) : (s.damage || 0);
  return ((0.5 * dmg) + (100 * (s.elim_kills || 0)) + (50 * (s.elim_assists || 0)) + (300 * (s.elim_mvps || 0))) / m;
}
function _sessionTdmScore(s) {
  var m = s.tdm_matches || 0;
  if (m === 0) return 0;
  // Use mode-specific damage if available, fall back to total only for legacy sessions
  var dmg = (s.elim_damage > 0 || s.tdm_damage > 0) ? (s.tdm_damage || 0) : (s.damage || 0);
  return ((0.25 * dmg) + (100 * (s.tdm_kills || 0)) + (50 * (s.tdm_assists || 0)) - (100 * (s.tdm_deaths || 0)) + (500 * (s.tdm_mvps || 0))) / m;
}
function _sessionCombinedScore(s) {
  var em = s.elim_matches || 0;
  var tm = s.tdm_matches  || 0;
  var total = em + tm;
  if (total === 0) return 0;
  return (_sessionElimScore(s) * em + _sessionTdmScore(s) * tm) / total;
}

function _getSessionEntriesToday() {
  var dbRows = getDbActiveSessionEntriesIfAvailable();
  if (dbRows !== null) return dbRows;

  var today = getTodayDateString();
  var keys  = Object.keys(stats);
  var byName = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entry = stats[key];
    if (!entry) continue;
    var s = entry.session;
    if (!(s && s.date === today && (s.matches || 0) > 0)) continue;
    var displayName = entry.name || key;
    var nameKey = String(displayName).toLowerCase();
    var prev = byName[nameKey];
    if (!prev) {
      byName[nameKey] = { name: displayName, session: s, key: key };
      continue;
    }
    // Prefer UUID-keyed entries over legacy name-keyed duplicates.
    if (isUuidKey(key) && !isUuidKey(prev.key)) {
      byName[nameKey] = { name: displayName, session: s, key: key };
      continue;
    }
    // Otherwise keep the row with more session matches.
    if ((s.matches || 0) > (prev.session.matches || 0)) {
      byName[nameKey] = { name: displayName, session: s, key: key };
    }
  }
  var arr = [];
  var names = Object.keys(byName);
  for (var ni = 0; ni < names.length; ni++) {
    var row = byName[names[ni]];
    arr.push([row.name, row.session]);
  }
  return arr;
}

function getSortedEntriesBySessionElimScore() {
  var dbRows = getDbActiveSessionEntriesIfAvailable();
  if (dbRows !== null) {
    var dbElim = [];
    for (var dbi = 0; dbi < dbRows.length; dbi++) {
      if ((dbRows[dbi][1].elim_matches || 0) > 0) dbElim.push(dbRows[dbi]);
    }
    dbElim.sort(function(a, b) { return _sessionElimScore(b[1]) - _sessionElimScore(a[1]); });
    return dbElim;
  }

  var today = getTodayDateString();
  var keys = Object.keys(stats);
  var byName = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entry = stats[key];
    if (!entry) continue;
    var s = entry.session;
    if (!(s && s.date === today && (s.elim_matches || 0) > 0)) continue;
    var displayName = entry.name || key;
    var nameKey = String(displayName).toLowerCase();
    var prev = byName[nameKey];
    if (!prev || (isUuidKey(key) && !isUuidKey(prev.key)) || ((s.elim_matches || 0) > (prev.session.elim_matches || 0))) {
      byName[nameKey] = { name: displayName, session: s, key: key };
    }
  }
  var arr = [];
  var names = Object.keys(byName);
  for (var ni = 0; ni < names.length; ni++) {
    var row = byName[names[ni]];
    arr.push([row.name, row.session]);
  }
  arr.sort(function(a, b) { return _sessionElimScore(b[1]) - _sessionElimScore(a[1]); });
  return arr;
}
function getSortedEntriesBySessionTdmScore() {
  var dbRows = getDbActiveSessionEntriesIfAvailable();
  if (dbRows !== null) {
    var dbTdm = [];
    for (var dbi = 0; dbi < dbRows.length; dbi++) {
      if ((dbRows[dbi][1].tdm_matches || 0) > 0) dbTdm.push(dbRows[dbi]);
    }
    dbTdm.sort(function(a, b) { return _sessionTdmScore(b[1]) - _sessionTdmScore(a[1]); });
    return dbTdm;
  }

  var today = getTodayDateString();
  var keys = Object.keys(stats);
  var byName = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entry = stats[key];
    if (!entry) continue;
    var s = entry.session;
    if (!(s && s.date === today && (s.tdm_matches || 0) > 0)) continue;
    var displayName = entry.name || key;
    var nameKey = String(displayName).toLowerCase();
    var prev = byName[nameKey];
    if (!prev || (isUuidKey(key) && !isUuidKey(prev.key)) || ((s.tdm_matches || 0) > (prev.session.tdm_matches || 0))) {
      byName[nameKey] = { name: displayName, session: s, key: key };
    }
  }
  var arr = [];
  var names = Object.keys(byName);
  for (var ni = 0; ni < names.length; ni++) {
    var row = byName[names[ni]];
    arr.push([row.name, row.session]);
  }
  arr.sort(function(a, b) { return _sessionTdmScore(b[1]) - _sessionTdmScore(a[1]); });
  return arr;
}
function getSortedEntriesBySessionCombinedScore() {
  var arr = _getSessionEntriesToday();
  arr.sort(function(a, b) { return _sessionCombinedScore(b[1]) - _sessionCombinedScore(a[1]); });
  return arr;
}

function statsSize() {
  return Object.keys(stats).length;
}

// ── String formatters ─────────────────────────────────────────
function formatEntry(name, e) {
  return '§e' + name + '§r — §bKD: §f' + getKD(e).toFixed(2) + '§r | §aDPL: §f' + getAvgDamagePerLife(e).toFixed(1);
}

function formatRoundEntryForKills(name, e) {
  return '§e' + name + '§r — §4Kills: §f' + e.kills;
}

function formatRoundEntryForDamage(name, e) {
  return '§e' + name + '§r — §cDamage: §f' + e.damage.toFixed(1);
}

function tellAll(server, msg) {
  if (!server || !server.players) return;
  server.players.forEach(function(p) { p.tell(msg); });
}

function makePostGameDotDivider(minWidth, contentWidth) {
  var width = Math.max(Number(minWidth) || 0, Number(contentWidth) || 0);
  if (width < 36) width = 36;
  if (width > 90) width = 90;
  var out = '';
  for (var i = 0; i < width; i++) out += '·';
  return '§8§m' + out;
}

function getMaxLineLength(lines) {
  if (!lines || !lines.length) return 0;
  var maxLen = 0;
  for (var i = 0; i < lines.length; i++) {
    var s = String(lines[i] == null ? '' : lines[i]);
    if (s.length > maxLen) maxLen = s.length;
  }
  return maxLen;
}

// ── MVP helpers ───────────────────────────────────────────────
function getRoundMvpScore(e) {
  if (!e) return 0;
  return (e.kills * 100.0) + e.damage;
}

function getRoundMvp() {
  var keys = Object.keys(roundStats);
  if (keys.length === 0) return null;
  var bestName  = keys[0];
  var bestEntry = roundStats[bestName];
  var bestScore = getRoundMvpScore(bestEntry);
  for (var i = 1; i < keys.length; i++) {
    var name  = keys[i];
    var entry = roundStats[name];
    var score = getRoundMvpScore(entry);
    if (score > bestScore) { bestName = name; bestEntry = entry; bestScore = score; continue; }
    if (score === bestScore) {
      if (entry.kills > bestEntry.kills || (entry.kills === bestEntry.kills && entry.damage > bestEntry.damage)) {
        bestName = name; bestEntry = entry; bestScore = score;
      }
    }
  }
  return { name: bestName, entry: bestEntry, score: bestScore };
}

function awardMvpToLifetime(server, playerName) {
  if (!playerName) return playerName;
  var targetPlayer = getOnlinePlayerByName(server, playerName);
  if (targetPlayer) {
    loadEntryFromPlayer(targetPlayer);
    var onlineEntry = getEntry(targetPlayer.name.string);
    onlineEntry.mvps = (onlineEntry.mvps || 0) + 1;
    saveEntryToPlayer(targetPlayer);
    return targetPlayer.name.string;
  }
  var existing = getExistingStatName(playerName);
  var resolved = existing || playerName;
  var entry    = getEntry(resolved);
  entry.mvps   = (entry.mvps || 0) + 1;
  markStatsDirty();
  return entry.name || resolved;
}

function broadcastPostGameScoreboard(server) {
  if (!server) return 0;

  // In tournament mode, use the compact per-player summary instead.
  if (typeof tournamentMode !== 'undefined' && tournamentMode) {
    if (typeof broadcastTournamentPostGame === 'function') broadcastTournamentPostGame(server);
    clearRoundStats();
    return 1;
  }

  var byKills  = getSortedRoundEntries('kills');
  if (byKills.length === 0) { tellAll(server, '§7[Gambit Stats] No stats recorded yet.'); return 0; }
  var byDamage     = getSortedRoundEntries('damage');
  var maxRowsKills  = Math.min(5, byKills.length);
  var maxRowsDamage = Math.min(5, byDamage.length);
  var mvp = getRoundMvp();

  // Build a consistent-width postgame card based on the longest visible content line.
  var _cardPlain = ['Post-Game Summary', 'Top 5: Kills', 'Top 5: Damage'];
  for (var _ki = 0; _ki < maxRowsKills; _ki++) {
    _cardPlain.push(((_ki + 1) + '. ' + byKills[_ki][0] + ' - Kills: ' + byKills[_ki][1].kills));
  }
  for (var _di = 0; _di < maxRowsDamage; _di++) {
    _cardPlain.push(((_di + 1) + '. ' + byDamage[_di][0] + ' - Damage: ' + byDamage[_di][1].damage.toFixed(1)));
  }
  if (mvp) {
    _cardPlain.push('MVP: ' + mvp.name + ' (' + mvp.entry.kills + ' Kills, ' + mvp.entry.damage.toFixed(1) + ' Damage)');
  }
  var _globalDivider = makePostGameDotDivider(49, getMaxLineLength(_cardPlain) + 6);

  // ── Resolve map/mode name from gambit_maps.js globals (shared Rhino scope) ──
  var _histMapName  = '';
  var _histModeName = '';
  try {
    if (typeof currentMapId !== 'undefined' && currentMapId > 0 && typeof MAPS !== 'undefined') {
      for (var _mi = 0; _mi < MAPS.length; _mi++) {
        if (MAPS[_mi].id === currentMapId) { _histMapName = MAPS[_mi].name; break; }
      }
    }
    if (typeof currentModeId !== 'undefined') {
      _histModeName = currentModeId === 1 ? 'TDM' : 'Elimination';
    }
  } catch(_me) {}

  tellAll(server, _globalDivider);
  tellAll(server, '§6§lPost-Game Summary');
  tellAll(server, _globalDivider);
  tellAll(server, '§6§lTop 5: Kills');
  for (var i = 0; i < maxRowsKills; i++) {
    tellAll(server, '§7' + (i + 1) + '. ' + formatRoundEntryForKills(byKills[i][0], byKills[i][1]));
  }
  tellAll(server, _globalDivider);
  tellAll(server, '§6§lTop 5: Damage');
  for (var j = 0; j < maxRowsDamage; j++) {
    tellAll(server, '§7' + (j + 1) + '. ' + formatRoundEntryForDamage(byDamage[j][0], byDamage[j][1]));
  }
  tellAll(server, _globalDivider);
  if (mvp) {
    var awardedName = awardMvpToLifetime(server, mvp.name);
    tellAll(server, '§a§lMVP: §e' + awardedName + '§r §7(' + mvp.entry.kills + ' Kills, ' + mvp.entry.damage.toFixed(1) + ' Damage)');
    tellAll(server, _globalDivider);
  }

  // Send each online player their own round summary as a private message.
  var onlinePlayers = server.players;
  for (var pi = 0; pi < onlinePlayers.size(); pi++) {
    var _pp = onlinePlayers.get(pi);
    var _pname = _pp.name.string;
    var _pe = roundStats[_pname];
    if (!_pe) continue;
    var _kills  = _pe.kills  || 0;
    var _dmg    = (_pe.damage || 0).toFixed(1);
    var _perfTitlePlain = 'Your Performance';
    var _perfLinePlain  = 'Kills: ' + _kills + '  Damage: ' + _dmg;
    var _perfDivider    = makePostGameDotDivider(49, getMaxLineLength([_perfTitlePlain, _perfLinePlain]) + 6);
    _pp.tell(_perfDivider);
    _pp.tell('§e§lYour Performance');
    _pp.tell('  §cKills: §f' + _kills + '  §6Damage: §f' + _dmg);
    _pp.tell(_perfDivider);

    if (gambitShouldTrackNormalStats()) {
      loadEntryFromPlayer(_pp);
      var _entry = getEntry(_pname);
      var _isMvp = (mvp && mvp.name && mvp.name === _pname);

      // Update session stats only while an explicit stats session is active.
      if (gambitShouldTrackSessionStats()) {
        if (!_entry.session || _entry.session.date !== getTodayDateString()) _entry.session = makeDefaultSession();
        _entry.session.kills   += (_pe.kills   || 0);
        _entry.session.deaths  += (_pe.deaths  || 0);
        _entry.session.damage  += (_pe.damage  || 0.0);
        _entry.session.assists += (_pe.assists || 0);
        if (_isMvp) _entry.session.mvps = (_entry.session.mvps || 0) + 1;
        var _isTdmSession = (_histModeName === 'TDM');
        if (_isTdmSession) {
          _entry.session.tdm_kills   = (_entry.session.tdm_kills   || 0) + (_pe.kills   || 0);
          _entry.session.tdm_deaths  = (_entry.session.tdm_deaths  || 0) + (_pe.deaths  || 0);
          _entry.session.tdm_damage  = (_entry.session.tdm_damage  || 0) + (_pe.damage  || 0);
          _entry.session.tdm_assists = (_entry.session.tdm_assists || 0) + (_pe.assists || 0);
          if (_isMvp) _entry.session.tdm_mvps = (_entry.session.tdm_mvps || 0) + 1;
        } else {
          _entry.session.elim_kills   = (_entry.session.elim_kills   || 0) + (_pe.kills   || 0);
          _entry.session.elim_deaths  = (_entry.session.elim_deaths  || 0) + (_pe.deaths  || 0);
          _entry.session.elim_damage  = (_entry.session.elim_damage  || 0) + (_pe.damage  || 0);
          _entry.session.elim_assists = (_entry.session.elim_assists || 0) + (_pe.assists || 0);
          if (_isMvp) _entry.session.elim_mvps = (_entry.session.elim_mvps || 0) + 1;
        }
      }

      // Write match history only when a map name is available
      if (_histMapName) {
        var _onRed  = hasTagSafe(_pp, 'Red');
        var _onBlue = hasTagSafe(_pp, 'Blue');
        var _won = false;
        if (pendingHistoryWinner === 'red'  && _onRed)  _won = true;
        if (pendingHistoryWinner === 'blue' && _onBlue) _won = true;
        pushMatchHistory(_pname, _histMapName, _histModeName, _pe, _won);
      }
      saveEntryToPlayer(_pp);
    }
  }
  pendingHistoryWinner = null;

  clearRoundStats();
  if (statsDirty) {
    try { saveStatsToDisk(); } catch (_pgSaveErr) { console.error('[Gambit Stats] Postgame flush failed: ' + _pgSaveErr); }
  }
  return Math.max(maxRowsKills, maxRowsDamage);
}

// ── Session card display ──────────────────────────────────────
function showSessionCard(viewer, name, e) {
  var s   = (e.session && e.session.date === getTodayDateString()) ? e.session : makeDefaultSession();
  var _sKills  = Number(s.kills || 0);
  var _sDeaths = Number(s.deaths || 0);
  var _sDamage = Number(s.damage || 0.0);
  var kd  = Number(_sDeaths > 0 ? (_sKills / _sDeaths) : _sKills).toFixed(2);
  var dpl = Number(_sDeaths > 0 ? (_sDamage / _sDeaths) : _sDamage).toFixed(1);
  var winPct = (s.matches > 0 ? (s.wins * 100 / s.matches).toFixed(1) : '0.0');
  viewer.tell('§6§l── Today\'s Stats: ' + name + ' ──');
  viewer.tell('  §4Kills: §f'    + (s.kills   || 0));
  viewer.tell('  §8Deaths: §f'   + (s.deaths  || 0));
  viewer.tell('  §bKD: §f'       + kd);
  viewer.tell('  §6Damage: §f'   + Number(s.damage || 0).toFixed(1));
  viewer.tell('  §aDPL: §f'      + dpl);
  viewer.tell('  §eAssists: §f'     + (s.assists || 0));
  viewer.tell('  §6Matches: §f'     + (s.matches || 0));
  viewer.tell('  §aWins: §f'        + (s.wins    || 0));
  viewer.tell('  §dWin %: §f'       + winPct + '%');
  viewer.tell('  §6MVPs: §f'        + (s.mvps    || 0));
  viewer.tell('  §cBest Streak: §f' + (s.longest_streak || 0));
  viewer.tell('  §aRevives: §f'     + (s.revives || 0));
  viewer.tell('§6§l──────────────────────');
}

// ── Match history display ─────────────────────────────────────
function showMatchHistory(viewer, name, e) {
  var history = e.match_history;
  viewer.tell('§6§l── Match History: ' + name + ' ──');
  if (!history || history.length === 0) {
    viewer.tell('  §7No matches recorded yet.');
    viewer.tell('§6§l──────────────────────');
    return;
  }
  for (var i = 0; i < history.length; i++) {
    var r    = history[i];
    var _kills  = Number(r && r.kills  ? r.kills  : 0);
    var _deaths = Number(r && r.deaths ? r.deaths : 0);
    var _damage = Number(r && r.damage ? r.damage : 0.0);
    var kd   = Number(_deaths > 0 ? (_kills / _deaths) : _kills).toFixed(2);
    var dpl  = Number(_deaths > 0 ? (_damage / _deaths) : _damage).toFixed(1);
    var wl   = r.won ? '§aW' : '§cL';
    var mode = r.mode ? '§8(' + r.mode + ')' : '';
    viewer.tell(
      '  ' + wl + ' §f' + (r.map || '?') + ' ' + mode +
      '  §7KD: §f' + kd +
      '  §7DPL: §f' + dpl
    );
  }
  viewer.tell('§6§l──────────────────────');
}

// ── Stat card display (Item 2: single source of truth) ───────
// Used by /gambitstats me, /gambitstats player, and legacy alias.
function showStatsCard(viewer, name, e) {
  viewer.tell('§6§l── Gambit Stats: ' + name + ' ──');
  viewer.tell('  §cDamage per Life: §f' + getAvgDamagePerLife(e).toFixed(2));
  viewer.tell('  §4Kills: §f'           + e.kills);
  viewer.tell('  §8Deaths: §f'          + e.deaths);
  viewer.tell('  §bKD: §f'              + getKD(e).toFixed(2));
  viewer.tell('  §eAssists: §f'         + (e.assists || 0));
  viewer.tell('  §dLongest Streak: §f'  + (e.longest_streak || 0));
  viewer.tell('  §aRevives: §f'         + (e.revives || 0));
  viewer.tell('  §6Matches: §f'         + e.matches);
  viewer.tell('  §aWins: §f'            + e.wins);
  viewer.tell('  §dWin %: §f'           + getWinPct(e).toFixed(1) + '%');
  viewer.tell('  §6MVPs: §f'            + (e.mvps || 0));
  viewer.tell('§8§m----------------------------');
  viewer.tell('  §2Elim Score/Match: §f'    + getElimAvgScore(e).toFixed(0)    + ' §8(' + (e.elim_matches || 0) + ' matches)');
  viewer.tell('  §2TDM Score/Match:  §f'    + getTdmAvgScore(e).toFixed(0)     + ' §8(' + (e.tdm_matches  || 0) + ' matches)');
  viewer.tell('  §aCombined Score/Match: §f' + getCombinedAvgScore(e).toFixed(0) + ' §8(' + ((e.elim_matches || 0) + (e.tdm_matches || 0)) + ' total)');
  viewer.tell('§6§l──────────────────────');
}

// ── Persistence ───────────────────────────────────────────────
function loadStatsFromDisk() {
  // Try MySQL first when enabled
  if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled()) {
    var dbStats = gambitDbLoadAllStats();
    if (dbStats !== null) {
      var dbKeys = Object.keys(dbStats);
      if (dbKeys.length > 0) {
        var dbLoaded = {};
        for (var di = 0; di < dbKeys.length; di++) {
          var _de = normalizeEntry(dbStats[dbKeys[di]]);
          if (!_de.name) _de.name = String(dbKeys[di]);
          dbLoaded[dbKeys[di]] = _de;
          if (isUuidKey(dbKeys[di])) uuidByName[_de.name.toLowerCase()] = dbKeys[di];
        }
        stats = dbLoaded;
        // MySQL never stores session or inline match_history data used by /stats history.
        // Merge both from JSON backup so restarts don't drop these fields when DB is primary.
        try {
          var jsonBackup = JsonIO.read(STATS_FILE_PATH);
          if (jsonBackup) {
            var today = getTodayDateString();
            var bjKeys = Object.keys(jsonBackup);
            var sessRestored = 0;
            var histRestored = 0;
            for (var bji = 0; bji < bjKeys.length; bji++) {
              var bjName = bjKeys[bji];
              var bjRaw  = jsonBackup[bjName];
              if (!bjRaw) continue;

              // Resolve target stats key by exact key first, then by stored display name.
              var targetKey = null;
              if (stats[bjName]) {
                targetKey = bjName;
              } else {
                var bjDisplay = bjRaw.name ? String(bjRaw.name) : '';
                if (bjDisplay) {
                  var resolved = getExistingStatName(bjDisplay);
                  if (resolved && stats[resolved]) targetKey = resolved;
                }
              }
              if (!targetKey) continue;

              if (bjRaw.session && bjRaw.session.date === today) {
                // Copy session fields directly — avoids calling normalizeEntry(bjRaw)
                // which would try to slice match_history (a Java-typed array from JsonIO.read)
                // and throw ArrayIndexOutOfBoundsException for any player with exactly 1 match.
                var bjSess = bjRaw.session;
                stats[targetKey].session = {
                  date:           today,
                  kills:          Math.floor(Number(bjSess.kills          || 0)),
                  deaths:         Math.floor(Number(bjSess.deaths         || 0)),
                  damage:         Number(bjSess.damage                    || 0.0),
                  matches:        Math.floor(Number(bjSess.matches        || 0)),
                  wins:           Math.floor(Number(bjSess.wins           || 0)),
                  assists:        Math.floor(Number(bjSess.assists        || 0)),
                  mvps:           Math.floor(Number(bjSess.mvps           || 0)),
                  elim_kills:     Math.floor(Number(bjSess.elim_kills     || 0)),
                  elim_deaths:    Math.floor(Number(bjSess.elim_deaths    || 0)),
                  elim_matches:   Math.floor(Number(bjSess.elim_matches   || 0)),
                  elim_damage:    Number(bjSess.elim_damage               || 0.0),
                  elim_assists:   Math.floor(Number(bjSess.elim_assists   || 0)),
                  elim_mvps:      Math.floor(Number(bjSess.elim_mvps      || 0)),
                  tdm_kills:      Math.floor(Number(bjSess.tdm_kills      || 0)),
                  tdm_deaths:     Math.floor(Number(bjSess.tdm_deaths     || 0)),
                  tdm_matches:    Math.floor(Number(bjSess.tdm_matches    || 0)),
                  tdm_damage:     Number(bjSess.tdm_damage                || 0.0),
                  tdm_assists:    Math.floor(Number(bjSess.tdm_assists    || 0)),
                  tdm_mvps:       Math.floor(Number(bjSess.tdm_mvps       || 0)),
                  longest_streak: Math.floor(Number(bjSess.longest_streak || 0)),
                  revives:        Math.floor(Number(bjSess.revives        || 0))
                };
                sessRestored++;
              }

              if (bjRaw.match_history) {
                var _mh = normalizeMatchHistory(bjRaw.match_history);
                if (_mh.length > 0) {
                  stats[targetKey].match_history = _mh;
                  histRestored++;
                }
              }
            }
            if (sessRestored > 0) console.info('[Gambit Stats] Restored today\'s session for ' + sessRestored + ' player(s) from JSON backup.');
            if (histRestored > 0) console.info('[Gambit Stats] Restored match history for ' + histRestored + ' player(s) from JSON backup.');
          }
        } catch (_je) {}
        console.info('[Gambit Stats] Loaded ' + dbKeys.length + ' player(s) from MySQL.');
        return true;
      }
    }
  }

  if (typeof gambitDbIsRequired === 'function' && gambitDbIsRequired()) {
    console.warn('[Gambit Stats] MySQL is the primary stats store, but DB load was unavailable or empty. Falling back to JSON backup.');
  }

  // Emergency fallback to JSON. MySQL remains the primary stats and analytics store.
  try {
    var parsed = JsonIO.read(STATS_FILE_PATH);
    if (!parsed) return false;
    var loaded = {};
    var keys   = Object.keys(parsed);
    for (var i = 0; i < keys.length; i++) {
      var _le = normalizeEntry(parsed[keys[i]]);
      if (!_le.name) _le.name = String(keys[i]);
      loaded[keys[i]] = _le;
      if (isUuidKey(keys[i])) uuidByName[_le.name.toLowerCase()] = keys[i];
    }
    stats = loaded;
    // Auto-migrate existing JSON data into MySQL on first run.
    if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled() && keys.length > 0) {
      console.info('[Gambit Stats] Migrating ' + keys.length + ' player(s) from JSON to MySQL...');
      gambitDbSaveAllStats(stats);
    }
    return true;
  } catch (e) {
    console.error('[Gambit Stats] Failed to load stats file: ' + e);
    return false;
  }
}

function saveStatsToDisk() {
  try {
    // Re-read the existing file and merge any entries that are on disk but not in memory
    // before writing. This ensures a partial in-memory state never silently drops players.
    var existing = null;
    try { existing = JsonIO.read(STATS_FILE_PATH); } catch (readErr) {}
    if (existing) {
      var diskKeys = Object.keys(existing);
      for (var i = 0; i < diskKeys.length; i++) {
        var _diskKey = diskKeys[i];
        if (stats[_diskKey]) continue;
        var _diskEntry = normalizeEntry(existing[_diskKey]);
        var _diskName = String(_diskEntry.name || _diskKey);
        var _resolved = getExistingStatName(_diskName);
        // If this player's data is already present under another key (typically UUID),
        // don't re-add a legacy duplicate key from disk backup.
        if (_resolved && stats[_resolved]) continue;
        stats[_diskKey] = _diskEntry;
      }
      // Rolling backup of last known-good file
      try { JsonIO.write(STATS_FILE_PATH + '.bak', existing); } catch (bakErr) {}
    }

    // Persist to MySQL as the primary stats store when enabled.
    if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled()) {
      gambitDbSaveAllStats(stats);
    }

    // Always write JSON as a local emergency backup.
    JsonIO.write(STATS_FILE_PATH, stats);
    statsDirty    = false;
    statsSaveTicker = 0;
  } catch (e) {
    console.error('[Gambit Stats] Failed to save stats: ' + e);
  }
}

// Load stats immediately on script evaluation (runs on both server start and /reload)
loadStatsFromDisk();
console.info('[Gambit Stats] Stat tracking is ' + (statsTrackingEnabled ? 'ENABLED' : 'DISABLED') + ' (persisted via gambit_dev_config.json — use /stats admin tracking on|off to change)');
