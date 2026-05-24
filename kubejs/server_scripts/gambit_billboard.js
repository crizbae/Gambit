// ============================================================
// Gambit Billboard
//
// Manages text_display leaderboard entities in the world.
// Positions are persisted in gambit_billboard_pos.json so they
// survive script reloads.
//
// Commands: /gambitboard — registered in gambit_commands.js
// ============================================================

var BILLBOARD_TAGS = {
  combined: 'gambit_billboard_combined', elim: 'gambit_billboard_elim', tdm: 'gambit_billboard_tdm',
  combined_session: 'gambit_billboard_combined_s', elim_session: 'gambit_billboard_elim_s', tdm_session: 'gambit_billboard_tdm_s'
};
// Y-axis quaternion left_rotation for each board (x,y,z,w).
// elim/tdm are tilted ±45° inward; combined faces straight ahead.
// If a side board is angled the wrong way after placement, swap its sign.
var BILLBOARD_ROTATION = {
  combined: '0f,0f,0f,1f',
  elim:     '0f,0.3827f,0f,0.9239f',
  tdm:      '0f,-0.3827f,0f,0.9239f',
  combined_session: '0f,0f,0f,1f',
  elim_session:     '0f,0.3827f,0f,0.9239f',
  tdm_session:      '0f,-0.3827f,0f,0.9239f'
};
var BILLBOARD_UPDATE_INTERVAL_TICKS = 100;
var BILLBOARD_POS_FILE = 'kubejs/data/gambit_billboard_pos.json';

var billboardUpdateTicker = 0;
var billboardPositions = { combined: null, elim: null, tdm: null, combined_session: null, elim_session: null, tdm_session: null };

var ALL_BILLBOARD_MODES = ['combined', 'elim', 'tdm', 'combined_session', 'elim_session', 'tdm_session'];

function loadBillboardPos() {
  try {
    var pos = JsonIO.read(BILLBOARD_POS_FILE);
    if (!pos) return;
    for (var mi = 0; mi < ALL_BILLBOARD_MODES.length; mi++) {
      var m = ALL_BILLBOARD_MODES[mi];
      if (pos[m] && typeof pos[m].x === 'number') {
        billboardPositions[m] = { x: Math.floor(pos[m].x), y: Math.floor(pos[m].y), z: Math.floor(pos[m].z), yaw: typeof pos[m].yaw === 'number' ? pos[m].yaw : 0 };
      }
    }
    // Backward compat: old format was {x,y,z} at top level — treat as combined
    if (billboardPositions.combined === null && typeof pos.x === 'number') {
      billboardPositions.combined = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), yaw: 0 };
    }
  } catch (e) {}
}

function saveBillboardPositions() {
  try {
    var toSave = {};
    for (var i = 0; i < ALL_BILLBOARD_MODES.length; i++) {
      var m = ALL_BILLBOARD_MODES[i];
      if (billboardPositions[m] !== null) toSave[m] = billboardPositions[m];
    }
    JsonIO.write(BILLBOARD_POS_FILE, toSave);
  } catch (e) {}
}

function buildBillboardText(mode) {
  var sorted, title, getScore, getKDFn;
  if (mode === 'elim') {
    sorted    = getSortedEntriesByElimScore();
    title     = '\u2550\u2550 Elim Leaderboard \u2550\u2550';
    getScore  = function(e) { return getElimAvgScore(e).toFixed(0); };
    getKDFn   = function(e) { return getElimKD(e).toFixed(2); };
  } else if (mode === 'tdm') {
    sorted    = getSortedEntriesByTdmScore();
    title     = '\u2550\u2550 TDM Leaderboard \u2550\u2550';
    getScore  = function(e) { return getTdmAvgScore(e).toFixed(0); };
    getKDFn   = function(e) { return getTdmKD(e).toFixed(2); };
  } else if (mode === 'elim_session') {
    sorted    = getSortedEntriesBySessionElimScore();
    title     = '\u2550\u2550 Elim Today \u2550\u2550';
    getScore  = function(s) { return _sessionElimScore(s).toFixed(0); };
    getKDFn   = function(s) { return ((s.elim_kills||0) / Math.max(1, s.elim_deaths||0)).toFixed(2); };
  } else if (mode === 'tdm_session') {
    sorted    = getSortedEntriesBySessionTdmScore();
    title     = '\u2550\u2550 TDM Today \u2550\u2550';
    getScore  = function(s) { return _sessionTdmScore(s).toFixed(0); };
    getKDFn   = function(s) { var k=(s.tdm_kills||0),d=(s.tdm_deaths||0); return (k/Math.max(1,d)).toFixed(2); };
  } else if (mode === 'combined_session') {
    sorted    = getSortedEntriesBySessionCombinedScore();
    title     = '\u2550\u2550 Combined Today \u2550\u2550';
    getScore  = function(s) { return _sessionCombinedScore(s).toFixed(0); };
    getKDFn   = function(s) {
      var k=(s.elim_kills||0)+(s.tdm_kills||0), d=(s.elim_deaths||0)+(s.tdm_deaths||0);
      return (k/Math.max(1,d)).toFixed(2);
    };
  } else {
    sorted    = getSortedEntries();
    title     = '\u2550\u2550 Gambit Leaderboard \u2550\u2550';
    getScore  = function(e) { return getCombinedAvgScore(e).toFixed(0); };
    getKDFn   = function(e) { return getCombinedKD(e).toFixed(2); };
  }

  var limit = Math.min(10, sorted.length);
  // nl: JS '\\\\n' → command \\n → SNBT parser outputs \n → JSON parser → newline
  var nl = '\\\\n';
  var sep = ' \u2502 '; // │ — column divider

  var components = [];
  components.push('{"text":"' + title + nl + '","color":"aqua","bold":true}');

  if (limit === 0) {
    components.push('{"text":"No stats yet","color":"gray"}');
  } else {
    for (var i = 0; i < limit; i++) {
      var row = sorted[i];
      if (!row) continue;
      var nameRaw = null;
      var e = null;
      var row0 = null;
      var row1 = null;
      try {
        if (row.length >= 2) {
          nameRaw = row[0];
          e = row[1];
        } else if (row.length === 1) {
          row0 = row[0];
        }
      } catch (_rowErr) {}
      if (nameRaw === null) {
        if (row0 === null) {
          try { if (row.length > 0) row0 = row[0]; } catch (_row0Err) {}
        }
        nameRaw = row.name || row.player || row0 || 'Unknown';
      }
      if (!e) {
        try { if (row.length > 1) row1 = row[1]; } catch (_row1Err) {}
        e = row.entry || row.stats || row1 || {};
      }
      var name = String(nameRaw).replace(/\\/g, '').replace(/"/g, '').replace(/'/g, '');
      var prefix, color;
      if (i === 0)      { prefix = '\u2605 '; color = 'red'; }
      else if (i === 1) { prefix = '\u2605 '; color = 'gold'; }
      else if (i === 2) { prefix = '\u2605 '; color = 'yellow'; }
      else              { prefix = (i + 1) + '. '; color = 'white'; }
      var line = prefix + name + '  Score:' + getScore(e) + sep + 'KD:' + getKDFn(e);
      var suffix = i < limit - 1 ? nl : '';
      components.push('{"text":"' + line + suffix + '","color":"' + color + '"}');
    }
  }

  var total = (mode.indexOf('session') !== -1) ? _getSessionEntriesToday().length : statsSize();
  components.push('{"text":"' + nl + '\u2500\u2500 ' + total + ' operators tracked \u2500\u2500","color":"dark_gray"}');

  return '[' + components.join(',') + ']';
}

function getBillboardRotation(mode, pos) {
  if (pos && typeof pos.yaw === 'number') {
    var table = {
      '0':   '0f,0f,0f,1f',
      '45':  '0f,-0.38268f,0f,0.92388f',
      '90':  '0f,-0.70711f,0f,0.70711f',
      '135': '0f,-0.92388f,0f,0.38268f',
      '180': '0f,-1f,0f,0f',
      '225': '0f,-0.92388f,0f,-0.38268f',
      '270': '0f,-0.70711f,0f,-0.70711f',
      '315': '0f,-0.38268f,0f,-0.92388f'
    };
    var snapped = String((((Math.round(pos.yaw / 45) * 45) % 360) + 360) % 360);
    return table[snapped] || '0f,0f,0f,1f';
  }
  return BILLBOARD_ROTATION[mode] || '0f,0f,0f,1f';
}

function buildBillboardEntityNbt(mode, textJson, rotation) {
  var tag = BILLBOARD_TAGS[mode];
  return '{Tags:["' + tag + '"],billboard:"fixed",background:0,line_width:300,transformation:{left_rotation:[' + rotation + '],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[1f,1f,1f]},text:\'' + textJson + '\'}';
}

function updateBillboard(server) {
  if (!server) return;
  for (var mi = 0; mi < ALL_BILLBOARD_MODES.length; mi++) {
    var m = ALL_BILLBOARD_MODES[mi];
    var pos = billboardPositions[m];
    if (!pos) continue;
    var tag = BILLBOARD_TAGS[m];
    var textJson = buildBillboardText(m);
    var rotation = getBillboardRotation(m, pos);
    var nbt = buildBillboardEntityNbt(m, textJson, rotation);
    server.runCommandSilent(
      'execute in minecraft:overworld unless entity @e[type=minecraft:text_display,tag=' + tag + ',limit=1] run summon minecraft:text_display ' + pos.x + ' ' + pos.y + ' ' + pos.z + ' ' + nbt
    );
    server.runCommandSilent(
      'execute in minecraft:overworld run data modify entity @e[type=minecraft:text_display,tag=' + tag + ',limit=1] text set value \'' + textJson + '\''
    );
  }
}

loadBillboardPos();
