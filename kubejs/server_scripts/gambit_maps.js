// ============================================================
// Gambit Map Registry
//
// To add a new map:
//   1. Add an entry to the MAPS array below
//   2. Run /kubejs reload server_scripts
//   3. The map is immediately available via /setmap
//
// Fields:
//   id              - Unique integer map ID
//   name            - Display name shown in /setmap announcements
//   preset          - Command literal for /setmap (no spaces, lowercase)
//   modes           - Array of supported modes: 'elimination', 'tdm', or both
//   red_spawn       - "X Y Z YAW PITCH" — Red team spawn (respawn + TDM start)
//   blue_spawn      - "X Y Z YAW PITCH" — Blue team spawn (respawn + TDM start)
//   spectator       - "X Y Z YAW PITCH" — spectator/observer TP
//   elim_start_red  - (Optional) override Red spawn for elimination round start
//   elim_start_blue - (Optional) override Blue spawn for elimination round start
//   variation       - (Optional) alternate map presentation/spawns used in voting.
//                     Object or array of objects: { name, red_spawn, blue_spawn, spectator?, elim_start_red?, elim_start_blue?, time? }
//   noVote          - (Optional) true to exclude this map from the vote pool
//
// Commands provided:
//   /setmap <preset>        — stage next map (OP, auto-generated from MAPS)
//   /start                  — start match with staged map (OP)
//   gambit_tp_respawn       — TP @s to team spawn (internal, called from mcfunction)
//   gambit_tp_spectator     — TP @s to spectator view (internal, called from mcfunction)
//   gambit_set_spawnpoints  — set TDM spawnpoints for both teams (internal)
//   gambit_match_end        — reset JS map state on match end (internal)
// ============================================================

// ── Map definitions ──────────────────────────────────────────
var MAPS = [
  {
    id: 2,
    name: 'Pine Crossing',
    preset: 'pinecrossing',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_far',
    red_spawn: '587.49 111.00 -410.55 -585.07 2.10',
    blue_spawn: '425.47 111.00 -574.54 -761.96 2.25',
    spectator: '491.94 146.16 -468.34 -498.36 40.95'
  },
  {
    id: 3,
    name: 'Trenches',
    preset: 'trenches',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_stal',
    red_spawn: '-4913.53 85.00 997.52 449.60 -1.50',
    blue_spawn: '-5087.48 85.00 1001.50 271.11 -0.30',
    spectator: '-4998.71 109.62 946.58 360.36 23.70',
    variation: {
      name: 'Trenches: Reclaimed',
      red_spawn: '-499.45 101.00 1500.53 -270.18 0.00',
      blue_spawn: '-673.45 101.00 1504.47 -448.87 -0.75',
      spectator: '-585.18 132.37 1463.35 -359.62 27.60'
    }
  },
  {
    id: 4,
    name: 'Training Grounds',
    preset: 'training_grounds',
    modes: ['tdm'],
    disc: 'minecraft:music_disc_blocks',
    red_spawn: '494.47 99.00 -904.45 -179.57 0.30',
    blue_spawn: '494.47 99.00 -1091.44 -0.32 0.45',
    spectator: '513.66 114.04 -999.56 89.98 39.45',
    variation: {
      name: 'Training Grounds: Snow Day',
      red_spawn: '-4584.52 58.00 1754.53 -180.45 0.45',
      blue_spawn: '-4584.53 58.00 1567.52 359.70 2.85',
      spectator: '-4565.70 72.87 1661.18 450.45 43.65'
    }
  },
  {
    id: 5,
    name: 'Mall',
    preset: 'mall',
    modes: ['tdm'],
    disc: 'minecraft:music_disc_mall',
    red_spawn: '-423.51 98.00 493.52 -270.09 -1.95',
    blue_spawn: '-567.53 98.00 493.53 -449.64 -1.50',
    spectator: '-499.48 114.66 507.54 -540.09 34.83',
    variation: {
      name: 'Mall: Overgrown',
      red_spawn: '-394.55 81.00 225.50 -629.85 -0.60',
      blue_spawn: '-538.43 81.00 225.51 -449.85 -2.10',
      spectator: '-467.10 105.37 213.88 -720.29 29.25'
    }
  },
  {
    id: 6,
    name: 'CryoLab',
    preset: 'cryolab',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_13',
    red_spawn: '390.54 104.00 1000.53 -90.25 -0.30',
    blue_spawn: '608.49 104.00 1000.51 89.75 -1.35',
    spectator: '497.99 109.34 1020.95 180.35 16.05'
  },
  {
    id: 7,
    name: 'Yuritopia',
    preset: 'yuritopia',
    modes: ['tdm'],
    disc: 'minecraft:music_disc_cat',
    red_spawn: '-395.48 94.00 1054.47 -930.08 2.77',
    blue_spawn: '-603.48 94.00 946.48 -1110.84 -0.74',
    spectator: '-508.27 117.54 1024.64 553.00 31.65'
  },
  {
    id: 8,
    name: 'Canopy',
    preset: 'canopy',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_chirp',
    red_spawn: '1000.51 94.00 569.38 -179.96 -5.10',
    blue_spawn: '1000.51 94.00 431.54 0.49 -2.55',
    spectator: '1060.56 120.78 500.47 90.34 19.71',
    variation: {
      name: 'Canopy: Withered',
      red_spawn: '-499.53 90.00 -361.51 181.24 -3.60',
      blue_spawn: '-499.50 90.00 -499.50 -0.41 -4.95',
      spectator: '-452.41 112.74 -430.26 89.44 18.90'
    }
  },
  {
    id: 10,
    name: 'Neapolitan',
    preset: 'neapolitan',
    noVote: true,
    modes: ['tdm'],
    red_spawn: '1045.49 83.00 -1073.50 -300.87 1.35',
    blue_spawn: '957.54 83.00 -922.50 -110.22 0.15',
    spectator: '958.85 110.29 -997.42 -89.70 37.58'
  },
  {
    id: 11,
    name: 'Vivian Station',
    preset: 'vivianstation',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_wait',
    red_spawn: '-999.51 106.00 588.46 -1620.47 2.55',
    blue_spawn: '-999.53 107.00 429.58 -1799.45 1.50',
    spectator: '-1009.90 118.03 501.71 -1891.24 33.30'
  },
  {
    id: 12,
    name: 'de_Solace',
    preset: 'solace',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_otherside',
    red_spawn: '536.43 119.00 513.51 90.05 1.50',
    blue_spawn: '448.53 119.00 517.54 -450.40 0.45',
    spectator: '484.95 140.66 492.27 -363.10 54.75'
  },
  {
    id: 13,
    name: 'Arena',
    preset: 'arena1',
    noVote: true,
    modes: ['elimination'],
    red_spawn: '-111.49 91.00 -35.51 -33840.06 0.45',
    blue_spawn: '-111.51 91.00 36.51 -33660.08 0.45',
    spectator: '-93.31 102.00 0.75 -33749.50 29.47',
  },
  {
    id: 14,
    name: 'Arena',
    preset: 'arena2',
    noVote: true,
    modes: ['elimination'],
    red_spawn: '-189.51 91.00 36.51 -33659.96 -0.60',
    blue_spawn: '-189.53 91.00 -35.50 -34560.19 0.45',
    spectator: '-167.62 96.00 0.48 -44550.13 10.20',
  },
  {
    id: 15,
    name: 'Arena',
    preset: 'arena3',
    noVote: true,
    modes: ['elimination'],
    red_spawn: '-266.50 91.00 36.42 -2339.95 0.30',
    blue_spawn: '-266.47 91.00 -35.45 -2159.97 0.60',
    spectator: '-244.60 96.00 0.53 -2428.75 10.20'
  },
  {
    id: 16,
    name: 'Freight',
    preset: 'freight',
    modes: ['tdm'],
    disc: 'minecraft:music_disc_mellohi',
    time: 13200,
    red_spawn: '-949.42 74.00 1050.50 90.27 0.90',
    blue_spawn: '-1049.53 74.00 1050.51 270.27 2.25',
    spectator: '-999.50 76.00 1002.34 -0.03 3.71'
  },
  {
    id: 17,
    name: 'Casino',
    preset: 'casino',
    modes: ['tdm'],
    disc: 'minecraft:music_disc_strad',
    red_spawn: '-4684.45 99.00 1176.54 -359.78 -0.60',
    blue_spawn: '-4684.50 99.00 1350.50 -540.08 -1.20',
    spectator: '-4651.90 108.02 1263.66 -1350.08 12.95'
  },
  {
    id: 18,
    name: 'Frostguard',
    preset: 'frostguard',
    modes: ['elimination'],
    disc: 'minecraft:music_disc_ward',
    red_spawn: '-4906.49 178.00 1665.62 -404.44 0.12',
    blue_spawn: '-4829.48 179.00 1768.51 -205.84 -1.95',
    spectator: '-4852.57 203.40 1694.43 -301.84 36.42'
  }
  
];

// ── Match state — JS is source of truth; scoreboard mirrors for mcfunction ──
var stagedMapId = 0;
var stagedMapVariant = null;
var stagedModeId = 0; // 0 = elimination, 1 = TDM
var currentMapId = 0;
var currentMapVariant = null;
var currentModeId = 0;
var matchStartTime = 0; // Date.now() when /start runs — used by gambit_log_match for duration
var matchActive = false; // true from /start until pleft/close (win declared) — gates stat tracking

// ── Autostart state ──────────────────────────────────────────
var AUTOSTART_DELAY_TICKS = 1200; // 60 seconds (20 ticks/s)
var autostartTicksLeft = 0;       // 0 = not scheduled
var autostartLastSecondsLeft = -1; // track last displayed second to avoid redundant bossbar updates

// ── Vote state ───────────────────────────────────────────────
var VOTE_DURATION_TICKS        = 600; // 30 seconds
var VOTE_AUTOSTART_DELAY_TICKS = 600; // 30s kit-select window after vote resolves
var voteActive                 = false;
var voteOptions                = []; // [{mapId, modeId, name, modeName, modeColor, bossbarColor}] — index 3 is the Random sentinel
var voteChoices                = {}; // { playerName: optionIndex (0|1|2|3) }
var voteChoiceMeta             = {}; // { playerName: { optionIndex, votedAtMs, playerUuid } }
var voteTicksLeft              = 0;
var voteLastSecondsLeft        = -1;
var voteExcludeMapId           = 0;  // map just played — excluded from random pick
var voteRoundCounter           = 0;
var pendingVoteRowsForMatch    = []; // consumed by gambit_log_match for analytics persistence
var RECENT_MAP_HISTORY_LIMIT   = 4;  // last map is hard-excluded; previous maps are downweighted
var RECENT_MAP_SOFT_WEIGHT     = 0.25;
var recentPlayedMapIds         = [];
var mapCheckTours              = {}; // { playerName: { map, stage, ticks } }
var StringArgumentType_Maps    = Java.loadClass('com.mojang.brigadier.arguments.StringArgumentType');
var IntegerArgumentType_Maps   = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType');
var Vec3_Maps                  = Java.loadClass('net.minecraft.world.phys.Vec3');

// ── Vote enabled toggle ──────────────────────────────────────
// Persisted in gambit_dev_config.json. When false, _startVote is a no-op.
// Toggle with /gambitvote enable|disable.
var voteEnabled = (function() {
  try {
    var _cfg = JsonIO.read('kubejs/data/gambit_dev_config.json');
    if (_cfg && typeof _cfg.vote_enabled !== 'undefined') return !!_cfg.vote_enabled;
  } catch (_e) {}
  return true;
})();

function _saveVoteConfig() {
  try {
    var _cfg = {};
    try { _cfg = JsonIO.read('kubejs/data/gambit_dev_config.json') || {}; } catch (_re) {}
    _cfg.vote_enabled = voteEnabled;
    JsonIO.write('kubejs/data/gambit_dev_config.json', _cfg);
  } catch (_e) {
    console.error('[Gambit] Failed to save vote config: ' + _e);
  }
}

// ── Helpers ──────────────────────────────────────────────────
function getMapById(id) {
  if (currentMapVariant && currentMapVariant.id === id) return currentMapVariant;
  if (stagedMapVariant && stagedMapVariant.id === id) return stagedMapVariant;
  for (var i = 0; i < MAPS.length; i++) {
    if (MAPS[i].id === id) return MAPS[i];
  }
  return null;
}

function _getBaseMapById(id) {
  for (var i = 0; i < MAPS.length; i++) {
    if (MAPS[i].id === id) return MAPS[i];
  }
  return null;
}

function _getMapVariations(map) {
  if (!map) return [];
  var raw = [];
  if (map.variations && map.variations.length) {
    raw = map.variations;
  } else if (map.variation) {
    raw = map.variation.length ? map.variation : [map.variation];
  }
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var v = raw[i];
    if (!v || typeof v !== 'object') continue;
    out.push(v);
  }
  return out;
}

function _buildMapVariation(map, variation, index) {
  if (!map || !variation) return map;
  var out = {};
  for (var key in map) {
    if (key === 'variation' || key === 'variations') continue;
    out[key] = map[key];
  }
  out.baseMapId = map.id;
  out.variationIndex = index;
  out.isVariation = true;
  out.name = variation.name || map.name;
  out.red_spawn = variation.red_spawn || map.red_spawn;
  out.blue_spawn = variation.blue_spawn || map.blue_spawn;
  out.spectator = variation.spectator || map.spectator;
  out.elim_start_red = variation.elim_start_red || variation.red_spawn || map.elim_start_red;
  out.elim_start_blue = variation.elim_start_blue || variation.blue_spawn || map.elim_start_blue;
  if (variation.time !== undefined && variation.time !== null) out.time = variation.time;
  if (variation.disc) out.disc = variation.disc;
  return out;
}

function _getMapCheckVariation(map, index) {
  var variations = _getMapVariations(map);
  if (!map || index < 1 || index > variations.length) return null;
  return _buildMapVariation(map, variations[index - 1], index);
}

function _pickMapVoteVariant(map) {
  var choices = [map];
  var variations = _getMapVariations(map);
  for (var i = 0; i < variations.length; i++) {
    choices.push(_buildMapVariation(map, variations[i], i + 1));
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

function _cancelActiveVote(server) {
  if (!voteActive) return;
  _removeVotePapers(server);
  voteActive = false;
  voteOptions = [];
  voteChoices = {};
  voteTicksLeft = 0;
  voteLastSecondsLeft = -1;
  voteExcludeMapId = 0;
}

function _stageNextMap(server, baseMap, stagedMap, modeId, modeName, modeColor, bossbarColor) {
  _cancelActiveVote(server);
  stagedMapId = baseMap.id;
  stagedMapVariant = stagedMap && stagedMap.isVariation ? stagedMap : null;
  stagedModeId = modeId;
  autostartTicksLeft = AUTOSTART_DELAY_TICKS;
  autostartLastSecondsLeft = -1;
  _announceNextMap(server, baseMap.id, modeId, modeName, stagedMap.name, modeColor, bossbarColor);
}

function _tellMapVariations(player, map) {
  var variations = _getMapVariations(map);
  if (!player || !player.tell) return 0;
  if (variations.length === 0) {
    player.tell('\u00a7c[Gambit] No variations registered for \u00a7f' + map.name + '\u00a7c.');
    return 0;
  }
  player.tell('\u00a76[Gambit] Variations for \u00a7f' + map.name + '\u00a76:');
  for (var i = 0; i < variations.length; i++) {
    var vm = _buildMapVariation(map, variations[i], i + 1);
    player.tell('\u00a7e' + (i + 1) + '\u00a77: \u00a7f' + vm.name);
  }
  return 1;
}

function getMapByPresetName(input) {
  var wanted = String(input || '').toLowerCase();
  if (wanted.indexOf('tdm_') === 0) wanted = wanted.substring(4);
  for (var i = 0; i < MAPS.length; i++) {
    if (String(MAPS[i].preset || '').toLowerCase() === wanted) return MAPS[i];
  }
  return null;
}

function suggestMapPresets(ctx, builder) {
  for (var i = 0; i < MAPS.length; i++) {
    var map = MAPS[i];
    if (!map || !map.preset) continue;
    builder.suggest(map.preset);
    if (map.modes && map.modes.indexOf('tdm') !== -1) builder.suggest('tdm_' + map.preset);
  }
  return builder.buildFuture();
}

function parseSpawnXYZ(spawnStr) {
  var raw = String(spawnStr == null ? '' : spawnStr).trim();
  var parts = raw.length > 0 ? raw.split(/\s+/) : [];
  if (parts.length < 3) return '0 101 0';

  var x = Math.floor(parseFloat(parts[0]));
  var y = Math.floor(parseFloat(parts[1]));
  var z = Math.floor(parseFloat(parts[2]));

  if (isNaN(x) || isNaN(y) || isNaN(z)) return '0 101 0';
  return x + ' ' + y + ' ' + z;
}

function parseSpawnPosition(spawnStr) {
  var raw = String(spawnStr == null ? '' : spawnStr).trim();
  var parts = raw.length > 0 ? raw.split(/\s+/) : [];
  if (parts.length < 3) return '0 101 0';

  var x = parseFloat(parts[0]);
  var y = parseFloat(parts[1]);
  var z = parseFloat(parts[2]);

  if (isNaN(x) || isNaN(y) || isNaN(z)) return '0 101 0';
  return x + ' ' + y + ' ' + z;
}

function validateSpawnString(spawnStr) {
  var raw = String(spawnStr == null ? '' : spawnStr).trim();
  var parts = raw.length > 0 ? raw.split(/\s+/) : [];
  if (parts.length < 5) return false;
  for (var i = 0; i < 5; i++) {
    if (isNaN(parseFloat(parts[i]))) return false;
  }
  return true;
}

function _mapCheckTell(player, text) {
  if (player && player.tell) player.tell(text);
}

function _mapCheckValidate(map) {
  var issues = [];
  if (!map) return ['Map not found.'];
  if (!map.id || isNaN(Number(map.id))) issues.push('Missing or invalid id.');
  if (!map.name) issues.push('Missing display name.');
  if (!map.preset) issues.push('Missing preset.');
  if (!map.modes || map.modes.length === 0) {
    issues.push('Missing modes.');
  } else {
    for (var i = 0; i < map.modes.length; i++) {
      if (map.modes[i] !== 'tdm' && map.modes[i] !== 'elimination') issues.push('Invalid mode: ' + map.modes[i]);
    }
  }
  if (!validateSpawnString(map.red_spawn)) issues.push('Invalid red_spawn.');
  if (!validateSpawnString(map.blue_spawn)) issues.push('Invalid blue_spawn.');
  if (!validateSpawnString(map.spectator)) issues.push('Invalid spectator.');
  if (!map.noVote && !map.disc) issues.push('Voteable map has no disc.');
  var variations = _getMapVariations(map);
  for (var vi = 0; vi < variations.length; vi++) {
    var vv = _buildMapVariation(map, variations[vi], vi + 1);
    var label = 'variation ' + (vi + 1);
    if (!vv.name) issues.push('Missing display name for ' + label + '.');
    if (!validateSpawnString(vv.red_spawn)) issues.push('Invalid red_spawn for ' + label + '.');
    if (!validateSpawnString(vv.blue_spawn)) issues.push('Invalid blue_spawn for ' + label + '.');
    if (!validateSpawnString(vv.spectator)) issues.push('Invalid spectator for ' + label + '.');
  }

  var ids = 0;
  var presets = 0;
  for (var mi = 0; mi < MAPS.length; mi++) {
    if (MAPS[mi].id === map.id) ids++;
    if (String(MAPS[mi].preset || '').toLowerCase() === String(map.preset || '').toLowerCase()) presets++;
  }
  if (ids > 1) issues.push('Duplicate map id: ' + map.id);
  if (presets > 1) issues.push('Duplicate preset: ' + map.preset);
  return issues;
}

function _mapCheckSummary(player, map) {
  var issues = _mapCheckValidate(map);
  if (map.isVariation) _mapCheckTell(player, '\u00a77Variation: \u00a7f#' + map.variationIndex + ' \u00a78| \u00a77Base map ID: \u00a7f' + map.baseMapId);
  _mapCheckTell(player, '§6§l── Map Check: §e' + map.name + ' §7(' + map.preset + ') §6§l──');
  _mapCheckTell(player, '§7ID: §f' + map.id + ' §8| §7Modes: §f' + (map.modes || []).join(', ') + ' §8| §7Vote: §f' + (map.noVote ? 'No' : 'Yes'));
  _mapCheckTell(player, '§cRed: §f' + map.red_spawn);
  _mapCheckTell(player, '§bBlue: §f' + map.blue_spawn);
  _mapCheckTell(player, '§eSpec: §f' + map.spectator);
  var variations = _getMapVariations(map);
  if (variations.length > 0) {
    _mapCheckTell(player, '§7Variations: §f' + variations.length);
    for (var vi = 0; vi < variations.length; vi++) {
      var vv = _buildMapVariation(map, variations[vi], vi + 1);
      _mapCheckTell(player, '§7  #' + (vi + 1) + ': §f' + vv.name + ' §8| §cR §f' + vv.red_spawn + ' §8| §bB §f' + vv.blue_spawn);
    }
  }
  if (map.time !== undefined && map.time !== null) _mapCheckTell(player, '§7Time override: §f' + map.time);
  if (!map.noVote) _mapCheckTell(player, '§7Vote disc: §f' + (map.disc || '(missing)'));
  if (issues.length === 0) {
    _mapCheckTell(player, '§aValidation passed.');
  } else {
    for (var i = 0; i < issues.length; i++) _mapCheckTell(player, '§cIssue: §f' + issues[i]);
  }
}

function _mapCheckTeleport(player, map, point) {
  if (!player || !player.server || !map) return 0;
  var name = getPlayerName(player);
  if (!name) return 0;
  var coords = point === 'red' ? map.red_spawn : (point === 'blue' ? map.blue_spawn : map.spectator);
  var color = point === 'red' ? 'red' : (point === 'blue' ? 'aqua' : 'yellow');
  var label = point === 'red' ? 'Red Spawn' : (point === 'blue' ? 'Blue Spawn' : 'Spectator View');
  player.server.runCommandSilent('title ' + name + ' times 5 35 10');
  player.server.runCommandSilent('title ' + name + ' title {"text":"' + label + '","color":"' + color + '","bold":true}');
  player.server.runCommandSilent('title ' + name + ' subtitle {"text":"' + map.name.replace(/"/g, '') + '","color":"white"}');
  player.server.runCommandSilent('execute in minecraft:overworld run tp ' + name + ' ' + coords);
  return 1;
}

function _startMapCheckTour(player, map) {
  var name = getPlayerName(player);
  if (!name) return 0;
  var ok = _mapCheckTeleport(player, map, 'red');
  if (!ok) return 0;
  mapCheckTours[name] = { map: map, stage: 1, ticks: 60 };
  _mapCheckTell(player, '§7Tour started: Red → Blue → Spectator.');
  return 1;
}

function getScoreValue(server, playerName, objectiveName) {
  try {
    var sb = server.getScoreboard ? server.getScoreboard() : server.scoreboard;
    if (!sb) return 0;
    var obj = sb.getObjective(objectiveName);
    if (!obj) return 0;
    return sb.getOrCreatePlayerScore(playerName, obj).getScore();
  } catch (e) {
    return 0;
  }
}

function resolveMapId(server) {
  if (currentMapId > 0) return currentMapId;
  // Fallback: read from scoreboard (handles manual starts / script reload mid-match)
  return getScoreValue(server, '#map', 'map_id');
}

// ── Vote helpers ─────────────────────────────────────────────

function _rememberPlayedMap(mapId) {
  mapId = Math.floor(Number(mapId) || 0);
  if (mapId <= 0) return;
  var out = [mapId];
  for (var i = 0; i < recentPlayedMapIds.length; i++) {
    var oldId = Math.floor(Number(recentPlayedMapIds[i]) || 0);
    if (oldId > 0 && oldId !== mapId && out.indexOf(oldId) === -1) out.push(oldId);
    if (out.length >= RECENT_MAP_HISTORY_LIMIT) break;
  }
  recentPlayedMapIds = out;
}

function _recentMapIndex(mapId) {
  for (var i = 0; i < recentPlayedMapIds.length; i++) {
    if (recentPlayedMapIds[i] === mapId) return i;
  }
  return -1;
}

function _effectiveRecentMapIndex(mapId, hardExcludeMapId) {
  if (hardExcludeMapId > 0) {
    if (mapId === hardExcludeMapId) return 0;
    for (var i = 0; i < recentPlayedMapIds.length; i++) {
      if (recentPlayedMapIds[i] === mapId) return i + (recentPlayedMapIds[0] === hardExcludeMapId ? 0 : 1);
    }
    return -1;
  }
  return _recentMapIndex(mapId);
}

function _buildVotePool(options) {
  options = options || {};
  var hardExcludeMapId = Math.floor(Number(options.hardExcludeMapId || 0));
  var shownIds = options.shownIds || {};
  var avoidRecent = options.avoidRecent !== false;
  var includeSoftRecent = !!options.includeSoftRecent;
  var pool = [];
  for (var i = 0; i < MAPS.length; i++) {
    var m = MAPS[i];
    if (m.id === hardExcludeMapId) continue;
    if (shownIds[m.id]) continue;
    if (m.noVote) continue;
    var hardRecentIndex = _effectiveRecentMapIndex(m.id, hardExcludeMapId);
    if (hardRecentIndex === 0) continue;
    var recentIndex = avoidRecent ? hardRecentIndex : -1;
    if (recentIndex > 0 && !includeSoftRecent) continue;
    var vm = _pickMapVoteVariant(m);
    for (var j = 0; j < m.modes.length; j++) {
      var isTdm = m.modes[j] === 'tdm';
      pool.push({
        mapId:        vm.id,
        map:          vm,
        modeId:       isTdm ? 1 : 0,
        name:         vm.name,
        modeName:     isTdm ? 'TDM' : 'Elimination',
        modeColor:    isTdm ? 'aqua' : 'green',
        bossbarColor: isTdm ? 'blue' : 'green',
        disc:         vm.disc || 'minecraft:music_disc_13',
        weight:       recentIndex > 0 ? RECENT_MAP_SOFT_WEIGHT : 1
      });
    }
  }
  return pool;
}

function _weightedShuffleVotePool(pool) {
  var remaining = pool.slice(0);
  var out = [];
  while (remaining.length > 0) {
    var total = 0;
    for (var i = 0; i < remaining.length; i++) total += Number(remaining[i].weight || 1);
    var roll = Math.random() * Math.max(0.0001, total);
    var chosen = 0;
    for (var j = 0; j < remaining.length; j++) {
      roll -= Number(remaining[j].weight || 1);
      if (roll <= 0) { chosen = j; break; }
    }
    out.push(remaining.splice(chosen, 1)[0]);
  }
  return out;
}

function _pickVoteOptions(excludeMapId) {
  var pool = _buildVotePool({ hardExcludeMapId: excludeMapId, avoidRecent: true, includeSoftRecent: false });
  if (pool.length < 3) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, avoidRecent: true, includeSoftRecent: true });
  }
  if (pool.length < 3) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, avoidRecent: false, includeSoftRecent: true });
  }
  return _weightedShuffleVotePool(pool).slice(0, 3);
}

function _pickRandomVoteWinner(excludeMapId, shownIds) {
  var pool = _buildVotePool({ hardExcludeMapId: excludeMapId, shownIds: shownIds, avoidRecent: true, includeSoftRecent: false });
  if (pool.length === 0) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, shownIds: shownIds, avoidRecent: true, includeSoftRecent: true });
  }
  if (pool.length === 0) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, shownIds: shownIds, avoidRecent: false, includeSoftRecent: true });
  }
  if (pool.length === 0) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, avoidRecent: true, includeSoftRecent: true });
  }
  if (pool.length === 0) {
    pool = _buildVotePool({ hardExcludeMapId: excludeMapId, avoidRecent: false, includeSoftRecent: true });
  }
  var shuffled = _weightedShuffleVotePool(pool);
  return shuffled.length > 0 ? shuffled[0] : null;
}

function _giveVotePapers(server) {
  var opts = voteOptions;
  server.players.forEach(function(player) {
    if (player.isCreative() || player.isSpectator()) return;
    for (var i = 0; i < 3; i++) {
      if (!opts[i]) continue;
      var opt = opts[i];
      var modeCol = opt.modeId === 1 ? 'aqua' : 'green';
      var nameJson = '[{"text":"' + opt.name + '","color":"white","italic":false},{"text":" \u2014 ' + opt.modeName + '","color":"' + modeCol + '","italic":false}]';
      var lore1 = '{"text":"Right-click to vote","color":"gray","italic":true}';
      var nbt = "{display:{Name:'" + nameJson + "',Lore:['" + lore1 + "']},GambitVote:" + (i + 1) + "b}";
      player.give(Item.of(opt.disc, nbt));
    }
    // Option 4: Random
    var randomName = '{"text":"Random Map","color":"light_purple","italic":false}';
    var randomLore = '{"text":"Right-click to vote","color":"gray","italic":true}';
    var randomNbt = "{display:{Name:'" + randomName + "',Lore:['" + randomLore + "']},GambitVote:4b}";
    player.give(Item.of('minecraft:music_disc_pigstep', randomNbt));
  });
}

function _removeVotePapers(server) {
  for (var i = 0; i < _VOTE_DISC_TYPES.length; i++) {
    server.runCommandSilent('clear @a ' + _VOTE_DISC_TYPES[i] + '{GambitVote:1b}');
    server.runCommandSilent('clear @a ' + _VOTE_DISC_TYPES[i] + '{GambitVote:2b}');
    server.runCommandSilent('clear @a ' + _VOTE_DISC_TYPES[i] + '{GambitVote:3b}');
    server.runCommandSilent('clear @a ' + _VOTE_DISC_TYPES[i] + '{GambitVote:4b}');
  }
}

// (kept as fallback — primary voting is now via inventory papers)
function _broadcastVoteOptions_unused(server) {
  server.runCommandSilent('tellraw @a {"text":"·················································","color":"dark_gray","strikethrough":true}');
  server.runCommandSilent('tellraw @a ["",{"text":"  Vote for the Next Map!","color":"gold","bold":true},{"text":"  (30 seconds)","color":"gray"}]');
  // Options 1-3: real maps
  for (var i = 0; i < 3 && i < voteOptions.length; i++) {
    var opt = voteOptions[i];
    var num = i + 1;
    server.runCommandSilent(
      'tellraw @a ["",{"text":"  [' + num + '] ","color":"yellow","bold":true,' +
        '"clickEvent":{"action":"run_command","value":"/gambitvote ' + num + '"},' +
        '"hoverEvent":{"action":"show_text","contents":{"text":"Click to vote","color":"gray"}}},' +
        '{"text":"' + opt.name.replace(/"/g, '') + '  ","color":"white"},' +
        '{"text":"' + opt.modeName + '","color":"' + opt.modeColor + '"}]'
    );
  }
  // Option 4: Random
  server.runCommandSilent(
    'tellraw @a ["",{"text":"  [4] ","color":"light_purple","bold":true,' +
      '"clickEvent":{"action":"run_command","value":"/gambitvote 4"},' +
      '"hoverEvent":{"action":"show_text","contents":{"text":"Click to vote for a random map","color":"gray"}}},' +
      '{"text":"Random Map","color":"gray","italic":true}]'
  );
  server.runCommandSilent('tellraw @a {"text":"·················································","color":"dark_gray","strikethrough":true}');
}

function _updateVoteBossbar(server, secondsLeft) {
  server.runCommandSilent(
    'bossbar set gun:nextmap name ["",{"text":"Vote for Next Map — ","color":"gold"},{"text":"' + secondsLeft + 's remaining","color":"yellow"}]'
  );
  server.runCommandSilent('bossbar set gun:nextmap color yellow');
  server.runCommandSilent('bossbar set gun:nextmap players @a');
  server.runCommandSilent('bossbar set gun:nextmap visible true');
}

function _resolveVote(server) {
  if (voteOptions.length === 0) return;

  // Tally (4 slots: 3 real maps + random)
  var tallies = [0, 0, 0, 0];
  var voters = Object.keys(voteChoices);
  for (var i = 0; i < voters.length; i++) {
    var c = voteChoices[voters[i]];
    if (c >= 0 && c <= 3) tallies[c]++;
  }

  // Find highest vote count, then pick randomly among ties
  var maxVotes = 0;
  for (var j = 0; j <= 3; j++) {
    if (tallies[j] > maxVotes) maxVotes = tallies[j];
  }
  var tied = [];
  for (var k = 0; k <= 3; k++) {
    if (tallies[k] === maxVotes) tied.push(k);
  }
  var winIdx = tied[Math.floor(Math.random() * tied.length)];
  var voteCount = tallies[winIdx];

  // Reset vote state before staging so tick handler doesn't fire again
  var savedExclude = voteExcludeMapId;
  var savedOptions = voteOptions.slice(0);  // Copy all options before clearing
  var savedChoices = {};
  var _savedChoiceNames = Object.keys(voteChoices);
  for (var sci = 0; sci < _savedChoiceNames.length; sci++) savedChoices[_savedChoiceNames[sci]] = voteChoices[_savedChoiceNames[sci]];
  var savedChoiceMeta = voteChoiceMeta;
  var savedVoteRoundId = voteRoundCounter;
  voteActive = false;
  voteOptions = [];
  voteChoices = {};
  voteChoiceMeta = {};
  voteTicksLeft = 0;
  voteLastSecondsLeft = -1;
  voteExcludeMapId = 0;
  _removeVotePapers(server);

  var winner;
  if (winIdx === 3) {
    // Random option won — prefer maps outside the shown options and recent history.
    var shownIds = {};
    shownIds[savedExclude] = true;
    for (var si = 0; si < savedOptions.length; si++) shownIds[savedOptions[si].mapId] = true;
    winner = _pickRandomVoteWinner(savedExclude, shownIds);
    if (!winner) return;
    server.runCommandSilent(
      'tellraw @a ["",{"text":"[Vote] ","color":"gold","bold":true},' +
      '{"text":"Random Map","color":"light_purple","italic":true},' +
      '{"text":" won! (' + voteCount + ' vote' + (voteCount !== 1 ? 's' : '') + ') — ","color":"gray"},' +
      '{"text":"' + winner.name.replace(/"/g, '') + '  ","color":"white","bold":true},' +
      '{"text":"' + winner.modeName + '","color":"' + winner.modeColor + '"}]'
    );
  } else {
    // A specific map won
    if (winIdx >= 0 && winIdx < savedOptions.length) {
      winner = savedOptions[winIdx];
    } else {
      // Fallback to random if winIdx is out of bounds (shouldn't happen, but be safe)
      var pool = [];
      for (var fi = 0; fi < MAPS.length; fi++) {
        var fm = MAPS[fi];
        if (fm.id === savedExclude) continue;
        if (fm.noVote) continue;
        for (var fj = 0; fj < fm.modes.length; fj++) {
          var fisTdm = fm.modes[fj] === 'tdm';
          var fvm = _pickMapVoteVariant(fm);
          pool.push({
            mapId: fvm.id, map: fvm, modeId: fisTdm ? 1 : 0, name: fvm.name,
            modeName: fisTdm ? 'TDM' : 'Elimination',
            modeColor: fisTdm ? 'aqua' : 'green', bossbarColor: fisTdm ? 'blue' : 'green',
            disc: fvm.disc || 'minecraft:music_disc_13'
          });
        }
      }
      winner = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : savedOptions[0];
    }
    server.runCommandSilent(
      'tellraw @a ["",{"text":"[Vote] ","color":"gold","bold":true},' +
      '{"text":"' + winner.name.replace(/"/g, '') + '  ","color":"white","bold":true},' +
      '{"text":"' + winner.modeName + '","color":"' + winner.modeColor + '"},' +
      '{"text":" won! (' + voteCount + ' vote' + (voteCount !== 1 ? 's' : '') + ')","color":"gray"}]'
    );
  }

  // Stage and kick off autostart
  stagedMapId = winner.mapId;
  stagedMapVariant = winner.map || _getBaseMapById(winner.mapId);
  stagedModeId = winner.modeId;
  server.runCommandSilent('scoreboard players set #selectors selector_active ' + (winner.modeId === 1 ? 1 : 0));
  autostartTicksLeft = VOTE_AUTOSTART_DELAY_TICKS;
  autostartLastSecondsLeft = -1;

  // Snapshot votes for analytics logging at match end.
  pendingVoteRowsForMatch = [];
  var _voterNames = Object.keys(savedChoices);
  for (var vni = 0; vni < _voterNames.length; vni++) {
    var _vName = _voterNames[vni];
    var _choice = savedChoices[_vName];
    var _meta = savedChoiceMeta && savedChoiceMeta[_vName] ? savedChoiceMeta[_vName] : null;
    var _row = {
      vote_round_id: savedVoteRoundId,
      player_name: _vName,
      player_uuid: _meta && _meta.playerUuid ? _meta.playerUuid : null,
      voted_map_id: null,
      voted_mode_id: null,
      was_random_vote: _choice === 3,
      voted_at_ms: _meta && _meta.votedAtMs ? _meta.votedAtMs : Date.now()
    };
    if (_choice !== 3 && _choice >= 0 && _choice < savedOptions.length) {
      _row.voted_map_id = savedOptions[_choice].mapId;
      _row.voted_mode_id = savedOptions[_choice].modeId;
    }
    pendingVoteRowsForMatch.push(_row);
  }

  _announceNextMap(server, winner.mapId, winner.modeId, winner.modeName, winner.name, winner.modeColor, winner.bossbarColor);
}

function _startVote(server, excludeMapId) {
  var tournamentActive = typeof tournamentMode !== 'undefined' && tournamentMode;
  if (tournamentActive || !voteEnabled) {
    voteActive = false;
    voteOptions = [];
    voteChoices = {};
    voteChoiceMeta = {};
    voteTicksLeft = 0;
    voteLastSecondsLeft = -1;
    voteExcludeMapId = 0;
    server.runCommandSilent('scoreboard players set #selectors selector_active 0');
    server.runCommandSilent('bossbar set gun:nextmap visible false');
    _removeVotePapers(server);
    return;
  }
  server.runCommandSilent('scoreboard players set #selectors selector_active 0');
  voteOptions = _pickVoteOptions(excludeMapId);
  if (voteOptions.length === 0) return; // no maps available — shouldn't happen
  voteRoundCounter += 1;
  voteExcludeMapId = excludeMapId;
  voteChoices = {};
  voteChoiceMeta = {};
  voteTicksLeft = VOTE_DURATION_TICKS;
  voteLastSecondsLeft = -1;
  voteActive = true;
  // Show bossbar immediately
  server.runCommandSilent('bossbar set gun:nextmap visible true');
  _updateVoteBossbar(server, Math.ceil(VOTE_DURATION_TICKS / 20));
  // Title screen
  server.runCommandSilent('title @a times 10 60 20');
  server.runCommandSilent('title @a title ["",{"text":"Vote for Next Map","color":"gold","bold":true}]');
  server.runCommandSilent('title @a subtitle {"text":"Check your inventory!","color":"yellow"}');
  // Brief chat notice
  server.runCommandSilent('tellraw @a ["",{"text":"[Vote] ","color":"gold","bold":true},{"text":"Right-click your vote discs to choose the next map.","color":"yellow"}]');
  // Give vote papers to all online players
  _giveVotePapers(server);
}

function _castVoteForPlayer(player, server, optionIndex) {
  if (!voteActive) return;
  if (optionIndex < 0 || optionIndex > 3) return;
  var playerName = getPlayerName(player);
  if (!playerName) return;
  voteChoices[playerName] = optionIndex;
  var _uuid = null;
  try { if (player && player.uuid) _uuid = String(player.uuid); } catch (e) {}
  voteChoiceMeta[playerName] = { optionIndex: optionIndex, votedAtMs: Date.now(), playerUuid: _uuid };
  if (optionIndex === 3) {
    player.tell('§7You voted for §5Random Map');
  } else if (voteOptions[optionIndex]) {
    var opt = voteOptions[optionIndex];
    player.tell('§7You voted for §f' + opt.name + ' §7— §' + (opt.modeId === 1 ? 'b' : 'a') + opt.modeName);
  }
  // Ding sound
  server.runCommandSilent('execute as ' + playerName + ' at @s run playsound minecraft:block.note_block.pling master @s ~ ~ ~ 1 2');
}

function _castVote(ctx, optionIndex) {
  if (!voteActive) {
    try { ctx.source.player.tell('§7No vote is currently active.'); } catch(e) {}
    return 0;
  }
  if (optionIndex < 0 || optionIndex > 3) return 0;
  var player = ctx.source.player;
  if (!player) return 0;
  _castVoteForPlayer(player, ctx.source.server, optionIndex);
  return 1;
}

function gambitGetPendingVoteRowsForMatch() {
  var out = pendingVoteRowsForMatch;
  pendingVoteRowsForMatch = [];
  return out;
}

function _announceNextMap(server, mapId, modeId, modeName, mapName, modeColor, bossbarColor) {
  server.runCommandSilent('scoreboard players set #nextmap nextmap_id ' + mapId);
  server.runCommandSilent('scoreboard players set #nextmode nextmap_mode ' + modeId);
  server.runCommandSilent(
    'bossbar set gun:nextmap name ["",{"text":"Destination: ","color":"gold"},{"text":"' + modeName + '","color":"' + modeColor + '"},{"text":" \u2014 ' + mapName + '","color":"white"},{"text":" \u2014 Starting in ' + Math.ceil(AUTOSTART_DELAY_TICKS / 20) + 's","color":"yellow"}]'
  );
  server.runCommandSilent('bossbar set gun:nextmap color ' + bossbarColor);
  server.runCommandSilent('bossbar set gun:nextmap players @a');
  server.runCommandSilent('bossbar set gun:nextmap visible true');
  server.runCommandSilent('title @a times 10 60 20');
  server.runCommandSilent(
    'title @a title ["",{"text":"Next Map","color":"gold","bold":true}]'
  );
  server.runCommandSilent(
    'title @a subtitle ["",{"text":"' + mapName + '  ","color":"white","bold":true},{"text":"\u2014  ","color":"gray"},{"text":"' + modeName + '","color":"' + modeColor + '","bold":true}]'
  );
}

function _updateAutostartBossbar(server, secondsLeft) {
  var map = getMapById(stagedMapId);
  if (!map) return;
  var isTdm = stagedModeId === 1;
  var modeName = isTdm ? 'TDM' : 'Elimination';
  var modeColor = isTdm ? 'aqua' : 'green';
  server.runCommandSilent(
    'bossbar set gun:nextmap name ["",{"text":"Destination: ","color":"gold"},{"text":"' + modeName + '","color":"' + modeColor + '"},{"text":" \u2014 ' + map.name + '","color":"white"},{"text":" \u2014 Starting in ' + secondsLeft + 's","color":"yellow"}]'
  );
}

function _executeStart(server) {
  if (stagedMapId === 0) {
    server.runCommandSilent(
      'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"No map staged. Run ","color":"red"},{"text":"/setmap <preset>","color":"yellow"},{"text":" first.","color":"red"}]'
    );
    return;
  }

  var map = getMapById(stagedMapId);
  if (!map) {
    server.runCommandSilent(
      'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Invalid map ID.","color":"red"}]'
    );
    return;
  }

  var isTdm = stagedModeId === 1;

  currentMapId = stagedMapId;
  currentMapVariant = map;
  currentModeId = stagedModeId;
  matchStartTime = Date.now();
  matchActive = true;
  entityFrameLocked = true;
  containerLocked = true;
  if (typeof gambitResetKitUsageTrackingForMatch === 'function') gambitResetKitUsageTrackingForMatch();

  // In tournament mode, skip random assignment and use pre-assigned rosters.
  // Read the JS variable directly (shared Rhino scope) — avoids the scoreboard
  // being reset to 0 by ServerEvents.loaded on any /kubejs reload server_scripts.
  var tournamentActive = typeof tournamentMode !== 'undefined' && tournamentMode;
  if (tournamentActive) {
    // Validate rosters here before continuing — _applyTournamentRosters returning early
    // would not stop the rest of _executeStart from running (countdown, death/loop, etc.).
    var tRed  = typeof tournamentRedRoster  !== 'undefined' ? tournamentRedRoster  : [];
    var tBlue = typeof tournamentBlueRoster !== 'undefined' ? tournamentBlueRoster : [];
    var tOnlineRed = typeof _getOnlineRosterNames === 'function' ? _getOnlineRosterNames(server, tRed) : tRed;
    var tOnlineBlue = typeof _getOnlineRosterNames === 'function' ? _getOnlineRosterNames(server, tBlue) : tBlue;
    if (tOnlineRed.length === 0 || tOnlineBlue.length === 0) {
      server.runCommandSilent(
        'tellraw @a ["",{"text":"[Tournament] ","color":"gold"},{"text":"Cannot start - both rosters must have at least one online player. Use /tournament status to check rosters.","color":"red"}]'
      );
      // Roll back state set above so a subsequent /start works cleanly.
      matchActive     = false;
      currentMapId    = 0;
      currentMapVariant = null;
      currentModeId   = 0;
      matchStartTime  = 0;
      return;
    }
    server.runCommandSilent('gambit_tournament_apply');
  } else {
    if (typeof gambitBalanceTeams === 'function') {
      gambitBalanceTeams(server, stagedModeId);
    } else {
      server.runCommandSilent('function gun:teams/randomize');
    }
  }
  server.runCommandSilent('scoreboard players set #map map_id ' + map.id);

  var redCoords = isTdm ? map.red_spawn : (map.elim_start_red || map.red_spawn);
  var blueCoords = isTdm ? map.blue_spawn : (map.elim_start_blue || map.blue_spawn);

  server.runCommandSilent('execute in minecraft:overworld run tp @a[tag=Red,gamemode=!spectator,gamemode=!creative] ' + redCoords);
  server.runCommandSilent('execute in minecraft:overworld run tp @a[tag=Blue,gamemode=!spectator,gamemode=!creative] ' + blueCoords);

  if (isTdm) {
    var _tdmPlayerCount = 0;
    if (server.players) {
      server.players.forEach(function(p) {
        if (!p.isCreative() && !p.isSpectator() && (hasTagSafe(p, 'Red') || hasTagSafe(p, 'Blue'))) _tdmPlayerCount += 1;
      });
    }
    var _tdmTarget = Math.max(10, _tdmPlayerCount * 2);
    server.runCommandSilent('scoreboard players set #target tdm_kill_target ' + _tdmTarget);
    server.runCommandSilent('function gun:tdm/init');
  } else {
    server.runCommandSilent('scoreboard players set #mode mode_id 0');
    server.runCommandSilent('scoreboard players set #mode mode_respawns 0');
  }

  // Tournament mode uses a separate mcfunction that scopes all player commands to Red/Blue only,
  // leaving everyone else completely untouched.
  if (tournamentActive) {
    server.runCommandSilent('function gun:starts/tournament_general');
  } else {
    server.runCommandSilent('function gun:starts/general');
  }

  // Custom kill feed handles announcements; keep vanilla death messages off to avoid duplicates.
  server.runCommandSilent('gamerule showDeathMessages false');

  // Apply per-map time override (starts/general and tournament_general both set time 6000 by default).
  if (map.time !== undefined && map.time !== null) {
    server.runCommandSilent('time set ' + Math.floor(map.time));
  }

  // Non-tournament: put gun_optout players into spectator and TP them to the map view.
  if (!tournamentActive) {
    server.runCommandSilent('execute as @a[tag=gun_optout,gamemode=!creative] run gamemode spectator @s');
    server.runCommandSilent('execute as @a[tag=gun_optout,gamemode=spectator] run function gun:starts/spectator_tpmap');
  }

  // Tournament: TP non-participants to the map spectator view and keep them in spectator mode.
  if (tournamentActive) {
    server.runCommandSilent('execute as @a[tag=!Red,tag=!Blue,gamemode=!creative] run function gun:starts/spectator_tpmap');
    server.runCommandSilent('gamemode spectator @a[tag=!Red,tag=!Blue,gamemode=!creative]');
  }

  // Tournament mode: strip syringes after kits have been fully applied.
  if (tournamentActive) {
    server.runCommandSilent('item replace entity @a[tag=Red,gamemode=!creative,gamemode=!spectator] hotbar.7 with minecraft:air');
    server.runCommandSilent('item replace entity @a[tag=Blue,gamemode=!creative,gamemode=!spectator] hotbar.7 with minecraft:air');
  }


}

// ── Hide bossbar on reload (autostartTicksLeft resets to 0, bossbar would get stuck) ──
ServerEvents.loaded(function(event) {
  event.server.runCommandSilent('scoreboard objectives add selector_active dummy');
  event.server.runCommandSilent('scoreboard players set #selectors selector_active 0');
  event.server.runCommandSilent('bossbar set gun:nextmap visible false');
  // Restore matchActive from scoreboard after a /kubejs reload mid-match.
  matchActive = getScoreValue(event.server, '#map', 'map_id') > 0;
  stagedMapVariant = null;
  currentMapVariant = null;
  // Clear any stale vote state from before the reload.
  voteActive = false;
  voteOptions = [];
  voteChoices = {};
  voteChoiceMeta = {};
  voteTicksLeft = 0;
  voteLastSecondsLeft = -1;
  voteExcludeMapId = 0;
  pendingVoteRowsForMatch = [];
  _removeVotePapers(event.server);

  if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled() && typeof gambitDbSyncDimensions === 'function') {
    var _kits = [];
    var _sourceKits = (typeof GAMBIT_KIT_KEYS !== 'undefined' && GAMBIT_KIT_KEYS.length)
      ? GAMBIT_KIT_KEYS
      : ['marksman', 'breacher', 'flanker', 'assault', 'sniper', 'ranger', 'burst', 'sentry', 'covert', 'gunslinger'];
    if (_sourceKits && _sourceKits.length) {
      for (var _ki = 0; _ki < _sourceKits.length; _ki++) {
        var _kk = String(_sourceKits[_ki]);
        if (_kits.indexOf(_kk) === -1) _kits.push(_kk);
      }
    }
    gambitDbSyncDimensions(MAPS, _kits);
  }
});

// ── Autostart tick ───────────────────────────────────────────
ServerEvents.tick(function(event) {
  // ── Vote phase ───────────────────────────────────────────
  if (voteActive) {
    voteTicksLeft -= 1;
    if (voteTicksLeft <= 0) {
      voteTicksLeft = 0;
      _resolveVote(event.server);
      return;
    }
    var vSeconds = Math.ceil(voteTicksLeft / 20);
    if (vSeconds !== voteLastSecondsLeft) {
      voteLastSecondsLeft = vSeconds;
      _updateVoteBossbar(event.server, vSeconds);
    }
    return;
  }

  if (autostartTicksLeft <= 0) return;

  autostartTicksLeft -= 1;

  if (autostartTicksLeft <= 0) {
    autostartTicksLeft = 0;
    autostartLastSecondsLeft = -1;
    event.server.runCommandSilent('execute as @a at @s run playsound minecraft:block.note_block.pling master @s ~ ~ ~ 1 2');
    _executeStart(event.server);
    return;
  }

  var secondsLeft = Math.ceil(autostartTicksLeft / 20);
  if (secondsLeft !== autostartLastSecondsLeft) {
    autostartLastSecondsLeft = secondsLeft;
    _updateAutostartBossbar(event.server, secondsLeft);

    // Title warning at 10 seconds
    if (secondsLeft === 10) {
      event.server.runCommandSilent('title @a times 10 40 10');
      event.server.runCommandSilent('title @a subtitle {"text":"Pick your kit!","color":"yellow"}');
      event.server.runCommandSilent('title @a title {"text":"Match starting in 10s","color":"red","bold":true}');
    }

    // Countdown beeps: 5, 4, 3, 2 — low click; 1 — higher pitch
    if (secondsLeft >= 2 && secondsLeft <= 5) {
      event.server.runCommandSilent('execute as @a at @s run playsound minecraft:block.note_block.hat master @s ~ ~ ~ 1 1');
    } else if (secondsLeft === 1) {
      event.server.runCommandSilent('execute as @a at @s run playsound minecraft:block.note_block.hat master @s ~ ~ ~ 1 1.5');
    }
  }
});

PlayerEvents.tick(function(event) {
  var player = event.player;
  if (!player || !hasTagSafe(player, 'gun_in_match')) return;
  if (player.isCreative && player.isCreative()) return;
  if (player.isSpectator && player.isSpectator()) return;
  if (!currentMapVariant) return;

  var spawn = null;
  if (hasTagSafe(player, 'Red')) {
    spawn = currentModeId === 1 ? currentMapVariant.red_spawn : (currentMapVariant.elim_start_red || currentMapVariant.red_spawn);
  } else if (hasTagSafe(player, 'Blue')) {
    spawn = currentModeId === 1 ? currentMapVariant.blue_spawn : (currentMapVariant.elim_start_blue || currentMapVariant.blue_spawn);
  }
  if (!spawn) return;

  try {
    player.setDeltaMovement(new Vec3_Maps(0, 0, 0));
    player.hurtMarked = true;
  } catch (e) {
  }

  var name = getPlayerName(player);
  if (!name) return;
  player.server.runCommandSilent('execute as ' + name + ' at @s run tp @s ' + parseSpawnPosition(spawn) + ' ~ ~');
});

ServerEvents.tick(function(event) {
  var names = Object.keys(mapCheckTours);
  if (names.length === 0) return;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var tour = mapCheckTours[name];
    if (!tour) continue;
    tour.ticks -= 1;
    if (tour.ticks > 0) continue;

    var player = getOnlinePlayerByName(event.server, name);
    var map = tour.map || _getBaseMapById(tour.mapId);
    if (!player || !map) {
      delete mapCheckTours[name];
      continue;
    }

    if (tour.stage === 1) {
      _mapCheckTeleport(player, map, 'blue');
      tour.stage = 2;
      tour.ticks = 60;
      continue;
    }
    if (tour.stage === 2) {
      _mapCheckTeleport(player, map, 'spec');
      delete mapCheckTours[name];
      _mapCheckTell(player, '§aMap check tour complete.');
      continue;
    }
    delete mapCheckTours[name];
  }
});


ServerEvents.commandRegistry(function (event) {
  var Commands = event.commands;

  // ── /setmap <preset> — dynamically generated from MAPS ──
  var setmapCmd = Commands.literal('setmap')
    .requires(function (src) { return src.hasPermission(2); });

  for (var i = 0; i < MAPS.length; i++) {
    (function (map) {
      for (var m = 0; m < map.modes.length; m++) {
        (function (mode) {
          var presetName = mode === 'tdm' ? 'tdm_' + map.preset : map.preset;
          var modeId = mode === 'tdm' ? 1 : 0;
          var modeName = mode === 'tdm' ? 'TDM' : 'Elimination';
          var modeColor = mode === 'tdm' ? 'aqua' : 'green';
          var bossbarColor = mode === 'tdm' ? 'blue' : 'green';

          setmapCmd = setmapCmd.then(
            Commands.literal(presetName)
              .executes(function (ctx) {
                _stageNextMap(ctx.source.server, map, map, modeId, modeName, modeColor, bossbarColor);
                return 1;
              })
              .then(
                Commands.literal('variations')
                  .executes(function(ctx) {
                    var player = ctx.source.player;
                    if (!player || !player.tell) return 0;
                    return _tellMapVariations(player, map);
                  })
              )
              .then(
                Commands.literal('variation')
                  .then(
                    Commands.argument('index', IntegerArgumentType_Maps.integer(1))
                      .executes(function(ctx) {
                        var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                        var staged = _getMapCheckVariation(map, index);
                        if (!staged) {
                          var player = ctx.source.player;
                          if (player && player.tell) {
                            player.tell('\u00a7c[Gambit] No variation #' + index + ' for \u00a7f' + map.name + '\u00a7c.');
                            _tellMapVariations(player, map);
                          }
                          return 0;
                        }
                        _stageNextMap(ctx.source.server, map, staged, modeId, modeName, modeColor, bossbarColor);
                        return 1;
                      })
                  )
              )
          );
        })(map.modes[m]);
      }
    })(MAPS[i]);
  }

  event.register(setmapCmd);

  event.register(
    Commands.literal('gambitmapcheck')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (player && player.tell) {
          player.tell('\u00a76[Gambit Map Check] \u00a7eVariations: /gambitmapcheck <preset> variation <number> [red|blue|spec|tour]');
          player.tell('§6[Gambit Map Check] §eUsage: /gambitmapcheck <preset> [red|blue|spec|tour]');
        }
        return 1;
      })
      .then(
        Commands.argument('preset', StringArgumentType_Maps.word())
          .suggests(suggestMapPresets)
          .executes(function(ctx) {
            var player = ctx.source.player;
            if (!player || !player.tell) return 1;
            var preset = StringArgumentType_Maps.getString(ctx, 'preset');
            var map = getMapByPresetName(preset);
            if (!map) {
              player.tell('§c[Gambit Map Check] Unknown map preset: §f' + preset);
              return 0;
            }
            _mapCheckSummary(player, map);
            return 1;
          })
          .then(
            Commands.literal('red')
              .executes(function(ctx) {
                var player = ctx.source.player;
                var map = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                if (!player || !map) return 0;
                _mapCheckSummary(player, map);
                return _mapCheckTeleport(player, map, 'red');
              })
          )
          .then(
            Commands.literal('blue')
              .executes(function(ctx) {
                var player = ctx.source.player;
                var map = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                if (!player || !map) return 0;
                _mapCheckSummary(player, map);
                return _mapCheckTeleport(player, map, 'blue');
              })
          )
          .then(
            Commands.literal('spec')
              .executes(function(ctx) {
                var player = ctx.source.player;
                var map = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                if (!player || !map) return 0;
                _mapCheckSummary(player, map);
                return _mapCheckTeleport(player, map, 'spec');
              })
          )
          .then(
            Commands.literal('tour')
              .executes(function(ctx) {
                var player = ctx.source.player;
                var map = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                if (!player || !map) return 0;
                _mapCheckSummary(player, map);
                return _startMapCheckTour(player, map);
              })
          )
          .then(
            Commands.literal('variation')
              .then(
                Commands.argument('index', IntegerArgumentType_Maps.integer(1))
                  .executes(function(ctx) {
                    var player = ctx.source.player;
                    var baseMap = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                    if (!player || !baseMap) return 0;
                    var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                    var map = _getMapCheckVariation(baseMap, index);
                    if (!map) {
                      player.tell('[Gambit Map Check] No variation #' + index + ' for ' + baseMap.name + '.');
                      return 0;
                    }
                    _mapCheckSummary(player, map);
                    return 1;
                  })
                  .then(
                    Commands.literal('red')
                      .executes(function(ctx) {
                        var player = ctx.source.player;
                        var baseMap = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                        if (!player || !baseMap) return 0;
                        var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                        var map = _getMapCheckVariation(baseMap, index);
                        if (!map) {
                          player.tell('[Gambit Map Check] No variation #' + index + ' for ' + baseMap.name + '.');
                          return 0;
                        }
                        _mapCheckSummary(player, map);
                        return _mapCheckTeleport(player, map, 'red');
                      })
                  )
                  .then(
                    Commands.literal('blue')
                      .executes(function(ctx) {
                        var player = ctx.source.player;
                        var baseMap = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                        if (!player || !baseMap) return 0;
                        var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                        var map = _getMapCheckVariation(baseMap, index);
                        if (!map) {
                          player.tell('[Gambit Map Check] No variation #' + index + ' for ' + baseMap.name + '.');
                          return 0;
                        }
                        _mapCheckSummary(player, map);
                        return _mapCheckTeleport(player, map, 'blue');
                      })
                  )
                  .then(
                    Commands.literal('spec')
                      .executes(function(ctx) {
                        var player = ctx.source.player;
                        var baseMap = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                        if (!player || !baseMap) return 0;
                        var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                        var map = _getMapCheckVariation(baseMap, index);
                        if (!map) {
                          player.tell('[Gambit Map Check] No variation #' + index + ' for ' + baseMap.name + '.');
                          return 0;
                        }
                        _mapCheckSummary(player, map);
                        return _mapCheckTeleport(player, map, 'spec');
                      })
                  )
                  .then(
                    Commands.literal('tour')
                      .executes(function(ctx) {
                        var player = ctx.source.player;
                        var baseMap = getMapByPresetName(StringArgumentType_Maps.getString(ctx, 'preset'));
                        if (!player || !baseMap) return 0;
                        var index = IntegerArgumentType_Maps.getInteger(ctx, 'index');
                        var map = _getMapCheckVariation(baseMap, index);
                        if (!map) {
                          player.tell('[Gambit Map Check] No variation #' + index + ' for ' + baseMap.name + '.');
                          return 0;
                        }
                        _mapCheckSummary(player, map);
                        return _startMapCheckTour(player, map);
                      })
                  )
              )
          )
      )
  );

  // ── /start — start match with staged map ──
  event.register(
    Commands.literal('start')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        autostartTicksLeft = 0; // cancel any pending autostart
        autostartLastSecondsLeft = -1;
        _executeStart(ctx.source.server);
        return 1;
      })
  );

  // ── gambit_tp_respawn — TP @s to team spawn ──
  // Called from death/tpmap.mcfunction via execute as <player>
  event.register(
    Commands.literal('gambit_tp_respawn')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        var server = ctx.source.server;
        var mapId = resolveMapId(server);
        if (mapId === 0) return 0;

        var map = getMapById(mapId);
        if (!map) return 0;

        var player = ctx.source.player;
        if (!player) return 0;

        var name = getPlayerName(player);
        if (!name) return 0;

        var coords = hasTagSafe(player, 'Red') ? map.red_spawn : map.blue_spawn;
        server.runCommandSilent('execute in minecraft:overworld run tp ' + name + ' ' + coords);
        return 1;
      })
  );

  // ── gambit_tp_spectator — TP @s to spectator view ──
  // Called from starts/spectator_tpmap.mcfunction via execute as <player>
  event.register(
    Commands.literal('gambit_tp_spectator')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        var server = ctx.source.server;
        var mapId = resolveMapId(server);
        if (mapId === 0) return 0;

        var map = getMapById(mapId);
        if (!map) return 0;

        var player = ctx.source.player;
        if (!player) return 0;

        var name = getPlayerName(player);
        if (!name) return 0;

        server.runCommandSilent('execute in minecraft:overworld run tp ' + name + ' ' + map.spectator);
        return 1;
      })
  );

  // ── gambit_set_spawnpoints — set TDM spawnpoints for both teams ──
  // Called from tdm/spawnpoints.mcfunction on a 20t schedule
  event.register(
    Commands.literal('gambit_set_spawnpoints')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        var server = ctx.source.server;
        var mapId = resolveMapId(server);
        if (mapId === 0) return 0;

        var map = getMapById(mapId);
        if (!map) return 0;

        var redXYZ = parseSpawnXYZ(map.red_spawn);
        var blueXYZ = parseSpawnXYZ(map.blue_spawn);

        server.runCommandSilent('execute as @a[tag=Red,gamemode=!creative] run spawnpoint @s ' + redXYZ);
        server.runCommandSilent('execute as @a[tag=Blue,gamemode=!creative] run spawnpoint @s ' + blueXYZ);
        return 1;
      })
  );

  // ── gambit_match_end — reset JS map state ──
  // Called from gameend.mcfunction
  event.register(
    Commands.literal('gambit_match_end')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        var lastMapId = currentMapId;
        currentMapId = 0;
        currentMapVariant = null;
        currentModeId = 0;
        matchStartTime = 0;
        matchActive = false;
        firstBloodDone = false; // belt-and-suspenders reset (also done in gambit_reset_downs)
        deathmatchGlowEnabled = false;
        autostartTicksLeft = 0;
        autostartLastSecondsLeft = -1;
        // Don't start a vote in tournament mode — OP controls map selection there.
        var tournamentActive = typeof tournamentMode !== 'undefined' && tournamentMode;
        if (!tournamentActive) {
          _rememberPlayedMap(lastMapId);
          _startVote(ctx.source.server, lastMapId);
        }
        return 1;
      })
  );

  // ── gambit_match_closing — stops stat tracking and clears pending executions ──
  // Called from pleft/close.mcfunction the moment a win condition fires.
  event.register(
    Commands.literal('gambit_match_closing')
      .requires(function (src) { return src.hasPermission(2); })
      .executes(function (ctx) {
        matchActive = false;
        // Drain any queued executions — nobody should be executed during postgame.
        if (typeof pendingExecutions !== 'undefined') pendingExecutions = [];
        return 1;
      })
  );

  // ── /gambitvote <1|2|3|4|stop|start> ──
  event.register(
    Commands.literal('gambitvote')
      .requires(function (src) { return true; })
      .then(Commands.literal('1').executes(function (ctx) { return _castVote(ctx, 0); }))
      .then(Commands.literal('2').executes(function (ctx) { return _castVote(ctx, 1); }))
      .then(Commands.literal('3').executes(function (ctx) { return _castVote(ctx, 2); }))
      .then(Commands.literal('4').executes(function (ctx) { return _castVote(ctx, 3); }))
      .then(
        Commands.literal('stop')
          .requires(function (src) { return src.hasPermission(2); })
          .executes(function (ctx) {
            voteActive = false;
            voteOptions = [];
            voteChoices = {};
            voteChoiceMeta = {};
            voteTicksLeft = 0;
            voteLastSecondsLeft = -1;
            voteExcludeMapId = 0;
            pendingVoteRowsForMatch = [];
            autostartTicksLeft = 0;
            autostartLastSecondsLeft = -1;
            ctx.source.server.runCommandSilent('bossbar set gun:nextmap visible false');
            _removeVotePapers(ctx.source.server);
            ctx.source.server.runCommandSilent(
              'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Map vote cancelled.","color":"red"}]'
            );
            return 1;
          })
      )
      .then(
        Commands.literal('disable')
          .requires(function (src) { return src.hasPermission(2); })
          .executes(function (ctx) {
            voteEnabled = false;
            _saveVoteConfig();
            voteActive = false;
            voteOptions = [];
            voteChoices = {};
            voteChoiceMeta = {};
            voteTicksLeft = 0;
            voteLastSecondsLeft = -1;
            autostartTicksLeft = 0;
            autostartLastSecondsLeft = -1;
            ctx.source.server.runCommandSilent('bossbar set gun:nextmap visible false');
            _removeVotePapers(ctx.source.server);
            ctx.source.server.runCommandSilent(
              'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Map voting disabled.","color":"red"}]'
            );
            return 1;
          })
      )
      .then(
        Commands.literal('enable')
          .requires(function (src) { return src.hasPermission(2); })
          .executes(function (ctx) {
            voteEnabled = true;
            _saveVoteConfig();
            ctx.source.server.runCommandSilent(
              'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Map voting enabled.","color":"green"}]'
            );
            return 1;
          })
      )
      .then(
        Commands.literal('start')
          .requires(function (src) { return src.hasPermission(2); })
          .executes(function (ctx) {
            if (typeof tournamentMode !== 'undefined' && tournamentMode) {
              try { ctx.source.player.tell('§cMap voting is disabled while tournament mode is ON.'); } catch(e) {}
              return 0;
            }
            if (voteActive) {
              try { ctx.source.player.tell('§cA vote is already active. Run /gambitvote stop first.'); } catch(e) {}
              return 0;
            }
            _startVote(ctx.source.server, currentMapId);
            return 1;
          })
      )
  );

  // ── gambit_restore_vote_paper ──────────────────────────────
  // Called from gun:kits/clear_hotbar after a full inventory clear.
  // Re-gives all vote papers to the executing player if a vote is active.
  event.register(
    Commands.literal('gambit_restore_vote_paper')
      .executes(function(ctx) {
        if (!voteActive || voteOptions.length === 0) return 1;
        var player = ctx.source.player;
        if (!player || !player.give) {
          try {
            var entity = ctx.source.entity;
            var ename = entity && (entity.username || (entity.name && entity.name.string));
            if (ename) player = getOnlinePlayerByName(ctx.source.server, ename);
          } catch(e) {}
        }
        if (!player || !player.give) return 1;
        if (player.isCreative() || player.isSpectator()) return 1;
        var opts = voteOptions;
        for (var i = 0; i < 3; i++) {
          if (!opts[i]) continue;
          var opt = opts[i];
          var modeCol = opt.modeId === 1 ? 'aqua' : 'green';
          var nameJson = '[{"text":"' + opt.name + '","color":"white","italic":false},{"text":" \u2014 ' + opt.modeName + '","color":"' + modeCol + '","italic":false}]';
          var lore1 = '{"text":"Right-click to vote","color":"gray","italic":true}';
          var nbt = "{display:{Name:'" + nameJson + "',Lore:['" + lore1 + "']},GambitVote:" + (i + 1) + "b}";
          player.give(Item.of(opt.disc, nbt));
        }
        var randomName = '{"text":"Random Map","color":"light_purple","italic":false}';
        var randomLore = '{"text":"Right-click to vote","color":"gray","italic":true}';
        var randomNbt = "{display:{Name:'" + randomName + "',Lore:['" + randomLore + "']},GambitVote:4b}";
        player.give(Item.of('minecraft:music_disc_pigstep', randomNbt));
        return 1;
      })
  );
});

// ── Vote disc right-click handlers ──────────────────────────
var _VOTE_DISC_TYPES = [
  'minecraft:music_disc_far',    // Pine Crossing
  'minecraft:music_disc_stal',   // Trenches
  'minecraft:music_disc_blocks', // Training Grounds
  'minecraft:music_disc_mall',   // Mall
  'minecraft:music_disc_13',     // CryoLab
  'minecraft:music_disc_cat',    // Yuritopia
  'minecraft:music_disc_chirp',  // Canopy
  'minecraft:music_disc_wait',   // Vivian Station
  'minecraft:music_disc_otherside', // de_Solace
  'minecraft:music_disc_mellohi',   // Freight
  'minecraft:music_disc_pigstep'    // Random
];
_VOTE_DISC_TYPES.forEach(function(discType) {
  ItemEvents.rightClicked(discType, function(event) {
    if (!voteActive) return;
    var nbt = event.item.nbt;
    if (!nbt || !nbt.contains('GambitVote')) return;
    var voteIdx = nbt.getInt('GambitVote') - 1; // tags are 1–4, options are 0–3
    _castVoteForPlayer(event.player, event.player.server, voteIdx);
    event.cancel();
  });
});
