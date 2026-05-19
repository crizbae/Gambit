// ============================================================
// Gambit Tracker
//
// Runtime event handlers: damage tracking, down/execution system,
// kill credit, kill streaks, revive tracking, and player lifecycle.
//
// Depends on: gambit_billboard.js, gambit_stats.js, gambit_helpers.js
// ============================================================

var DOWNS_CONFIG_FILE                = 'kubejs/data/gambit_downs_config.json';
var KILL_MESSAGES_FILE               = 'kubejs/data/gambit_kill_messages.json';
var LAST_TACZ_ATTACK_TTL_MS          = 15000;
var DOWNED_WINDOW_MS                 = 60000;
var ATTACKER_CACHE_CLEANUP_INTERVAL_TICKS = 200;

// ── Canonical kit list (Item 3) ───────────────────────────────
// Single source of truth for JS. Used by loggedOut cleanup.
var VALID_KITS = ['assault', 'breacher', 'burst', 'flanker', 'marksman', 'ranger', 'sniper', 'sentry', 'covert', 'gunslinger'];
var ANALYTICS_KITS = ['assault', 'breacher', 'burst', 'flanker', 'marksman', 'ranger', 'sniper', 'sentry', 'covert', 'gunslinger'];

// ── Runtime tracking state ────────────────────────────────────
var recentPlayerAttackers = {};
var currentStreaks         = {}; // { playerName: number } — reset on death, not persisted
var downerNames           = {}; // { deadPlayerName: downerName } — most recent downer (bleed-out kill credit)
var firstDownerNames      = {}; // { deadPlayerName: downerName } — first downer this life (assist credit)
var executionKillerNames  = {}; // { deadPlayerName: killerName } — finisher execution attribution for kill credit
var executionAnnouncements = {}; // { victimName: expiresAtMs } — avoids duplicate execution feed/FX
var syringeCounts         = {}; // { playerName: syringe count last poll } — revive tracking
var recentlyDowned        = {}; // { playerName: expiresAtMs } — window for syringe revive credit

// Kit analytics runtime state (built during an active match, flushed at match end).
var analyticsKitStates = {};        // { playerId: { player_name, player_uuid, kit_key, selected_at_ms, is_initial_pick } }
var analyticsKitRows   = [];        // finalized segments ready for DB insert
var analyticsKitTicker = 0;

var reviveCheckTicker          = 0;
var attackerCacheCleanupTicker = 0;
var firstBloodDone             = false; // reset by gambit_reset_downs and gambit_match_end

// ── Kill-feed message pools ───────────────────────────────────
// Defaults used when gambit_kill_messages.json is missing or malformed.
// Edit the JSON file instead of changing these.
var _KILL_MSGS            = [' was killed by '];
var _TOURNAMENT_KILL_MSGS = [' was shot by '];
var _EXECUTION_MSGS       = [' was finished by '];
var _SOLO_EXECUTION_MSGS  = [' was executed.'];
var _FIRST_BLOOD_MSGS     = [' drew first blood on '];

function _analyticsGetPlayerId(player) {
  if (!player) return null;
  try { if (player.uuid) return String(player.uuid); } catch (e) {}
  return getPlayerName(player);
}

function _analyticsDetectCurrentKit(player) {
  if (!player) return null;
  for (var i = 0; i < ANALYTICS_KITS.length; i++) {
    var k = ANALYTICS_KITS[i];
    if (hasTagSafe(player, k)) return k;
  }
  return null;
}

function _analyticsCloseKitSegment(playerId, endMs, reason) {
  var st = analyticsKitStates[playerId];
  if (!st) return;
  var started = Number(st.selected_at_ms || endMs);
  var ended = Number(endMs || Date.now());
  if (ended < started) ended = started;
  analyticsKitRows.push({
    player_name: st.player_name,
    player_uuid: st.player_uuid,
    kit_key: st.kit_key,
    selected_at_ms: started,
    deselected_at_ms: ended,
    active_seconds: Math.floor((ended - started) / 1000),
    is_initial_pick: st.is_initial_pick ? true : false,
    selection_reason: reason || 'swap'
  });
  delete analyticsKitStates[playerId];
}

function _analyticsOpenKitSegment(player, kitKey, startMs, isInitial) {
  var pid = _analyticsGetPlayerId(player);
  if (!pid || !kitKey) return;
  analyticsKitStates[pid] = {
    player_name: getPlayerName(player),
    player_uuid: player && player.uuid ? String(player.uuid) : null,
    kit_key: String(kitKey),
    selected_at_ms: Number(startMs || Date.now()),
    is_initial_pick: isInitial ? true : false
  };
}

function gambitResetKitUsageTrackingForMatch() {
  analyticsKitStates = {};
  analyticsKitRows = [];
  analyticsKitTicker = 0;
}

function gambitCollectKitUsageRowsForAnalytics(server) {
  var now = Date.now();
  var stateIds = Object.keys(analyticsKitStates);
  for (var i = 0; i < stateIds.length; i++) {
    _analyticsCloseKitSegment(stateIds[i], now, 'match_end');
  }
  var out = analyticsKitRows;
  analyticsKitRows = [];
  analyticsKitStates = {};
  analyticsKitTicker = 0;
  return out;
}

function hasPlayerReviveBleeding(entity) {
  if (!entity) return false;
  try {
    var activeMap = entity.potionEffects && entity.potionEffects.getMap ? entity.potionEffects.getMap() : null;
    if (activeMap && activeMap.entrySet) {
      for (var it = activeMap.entrySet().iterator(); it.hasNext(); ) {
        var entry = it.next();
        var keyText = String(entry.getKey());
        if (keyText.indexOf('playerrevive:bleeding') !== -1 || keyText.indexOf(':bleeding') !== -1) return true;
      }
    }
  } catch (e2) {}

  return false;
}

function announceExecutionFeedAndFx(server, victimName, killerName) {
  if (!server || !victimName) return;

  var victimPlayer = getOnlinePlayerByName(server, victimName);
  var killerPlayer = killerName ? getOnlinePlayerByName(server, killerName) : null;

  var victimTeam = victimPlayer
    ? (hasTagSafe(victimPlayer, 'Red') ? 'Red' : (hasTagSafe(victimPlayer, 'Blue') ? 'Blue' : 'Unknown'))
    : 'Unknown';
  var killerTeam = killerPlayer
    ? (hasTagSafe(killerPlayer, 'Red') ? 'Red' : (hasTagSafe(killerPlayer, 'Blue') ? 'Blue' : 'Unknown'))
    : 'Unknown';

  var victimColor = victimTeam === 'Red' ? 'red' : (victimTeam === 'Blue' ? 'aqua' : 'white');
  var killerColor = killerTeam === 'Red' ? 'red' : (killerTeam === 'Blue' ? 'aqua' : 'white');

  if (killerName && killerName !== victimName) {
    var _execMsg = _EXECUTION_MSGS[Math.floor(Math.random() * _EXECUTION_MSGS.length)];
    server.runCommandSilent('tellraw @a ["",' +
      '{"text":"[' + victimTeam + '] ","color":"' + victimColor + '"},' +
      '{"text":"' + victimName + '","color":"' + victimColor + '"},' +
      '{"text":"' + _execMsg + '","color":"white"},' +
      '{"text":"[' + killerTeam + '] ","color":"' + killerColor + '"},' +
      '{"text":"' + killerName + '","color":"' + killerColor + '"}' +
    ']');
  } else {
    var _soloExecMsg = _SOLO_EXECUTION_MSGS[Math.floor(Math.random() * _SOLO_EXECUTION_MSGS.length)];
    server.runCommandSilent('tellraw @a ["",' +
      '{"text":"[' + victimTeam + '] ","color":"' + victimColor + '"},' +
      '{"text":"' + victimName + '","color":"' + victimColor + '"},' +
      '{"text":"' + _soloExecMsg + '","color":"white"}' +
    ']');
  }

  server.runCommandSilent('execute at ' + victimName + ' run particle minecraft:dust 1 0 0 1 ~ ~1 ~ 0.4 0.6 0.4 0.05 80 normal');
  server.runCommandSilent('execute at ' + victimName + ' run particle minecraft:dust 0.6 0 0 0.8 ~ ~1 ~ 0.2 0.4 0.2 0.02 40 normal');

  executionAnnouncements[victimName] = Date.now() + 5000;
}

// ── Down limit config ─────────────────────────────────────────
// max_downs: lethal-down cap. When a lethal hit would reach this count, it executes instead.
// bypass_source_types: getMsgId() strings that skip down tracking (fall, fire, etc.)
var downsConfig = { enabled: true, max_downs: 2, bypass_source_types: [] };

function loadKillMessages() {
  try {
    var raw = JsonIO.read(KILL_MESSAGES_FILE);
    if (!raw) return;
    if (raw.kill && raw.kill.length > 0) {
      _KILL_MSGS = [];
      for (var _i = 0; _i < raw.kill.length; _i++) _KILL_MSGS.push(String(raw.kill[_i]));
    }
    if (raw.tournament_kill && raw.tournament_kill.length > 0) {
      _TOURNAMENT_KILL_MSGS = [];
      for (var _i = 0; _i < raw.tournament_kill.length; _i++) _TOURNAMENT_KILL_MSGS.push(String(raw.tournament_kill[_i]));
    }
    if (raw.execution && raw.execution.length > 0) {
      _EXECUTION_MSGS = [];
      for (var _i = 0; _i < raw.execution.length; _i++) _EXECUTION_MSGS.push(String(raw.execution[_i]));
    }
    if (raw.solo_execution && raw.solo_execution.length > 0) {
      _SOLO_EXECUTION_MSGS = [];
      for (var _i = 0; _i < raw.solo_execution.length; _i++) _SOLO_EXECUTION_MSGS.push(String(raw.solo_execution[_i]));
    }
    if (raw.first_blood && raw.first_blood.length > 0) {
      _FIRST_BLOOD_MSGS = [];
      for (var _i = 0; _i < raw.first_blood.length; _i++) _FIRST_BLOOD_MSGS.push(String(raw.first_blood[_i]));
    }
  } catch (e) {
    console.error('[Gambit] Failed to load kill messages config: ' + e);
  }
}

function loadDownsConfig() {
  try {
    var raw = JsonIO.read(DOWNS_CONFIG_FILE);
    if (!raw) return;
    if (typeof raw.enabled === 'boolean') downsConfig.enabled = raw.enabled;
    if (typeof raw.max_downs === 'number') downsConfig.max_downs = Math.max(1, Math.floor(raw.max_downs));
    if (raw.bypass_source_types) {
      var list = [];
      for (var i = 0; i < raw.bypass_source_types.length; i++) {
        list.push(String(raw.bypass_source_types[i]));
      }
      downsConfig.bypass_source_types = list;
    }
  } catch (e) {
    console.error('[Gambit Downs] Failed to load downs config: ' + e);
  }
}

// ── Attacker cache helpers ────────────────────────────────────
function getPlayerId(player) {
  if (!player) return null;
  try { if (player.uuid) return String(player.uuid); } catch (e) {}
  var name = player.name && player.name.string ? player.name.string : null;
  return name ? String(name) : null;
}

function rememberRecentAttacker(victim, attacker) {
  var victimId     = getPlayerId(victim);
  var attackerName = attacker && attacker.name && attacker.name.string ? attacker.name.string : null;
  if (!victimId || !attackerName) return;
  var entry = recentPlayerAttackers[victimId];
  if (!entry || !entry.all) { entry = { last: attackerName, all: {} }; recentPlayerAttackers[victimId] = entry; }
  entry.last = attackerName;
  entry.all[attackerName] = Date.now() + LAST_TACZ_ATTACK_TTL_MS;
}

// Returns { killerName, assistNames[] } — killerName is the last attacker within the TTL window.
function consumeRecentAttackInfo(victim) {
  var victimId = getPlayerId(victim);
  if (!victimId) return { killerName: null, assistNames: [] };
  var entry = recentPlayerAttackers[victimId];
  delete recentPlayerAttackers[victimId];
  if (!entry) return { killerName: null, assistNames: [] };
  var now        = Date.now();
  var killerName = entry.last || null;
  var assistNames = [];
  if (!entry.all) return { killerName: killerName, assistNames: [] };
  // Verify killer entry hasn't expired
  if (killerName && entry.all[killerName] && now > entry.all[killerName]) killerName = null;
  var names = Object.keys(entry.all);
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (n === killerName) continue;
    if (now <= entry.all[n]) assistNames.push(n);
  }
  return { killerName: killerName, assistNames: assistNames };
}

function cleanupExpiredAttackerCache() {
  var now       = Date.now();
  var victimIds = Object.keys(recentPlayerAttackers);
  for (var i = 0; i < victimIds.length; i++) {
    var vid   = victimIds[i];
    var entry = recentPlayerAttackers[vid];
    if (!entry || !entry.all) { delete recentPlayerAttackers[vid]; continue; }
    var names = Object.keys(entry.all);
    for (var j = 0; j < names.length; j++) {
      if (now > entry.all[names[j]]) delete entry.all[names[j]];
    }
    if (Object.keys(entry.all).length === 0) delete recentPlayerAttackers[vid];
  }
}

// ── Server loaded ─────────────────────────────────────────────
ServerEvents.loaded(function(event) {
  // Initialize MySQL connection if configured
  if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled()) {
    gambitDbConnect();
    gambitDbInitTables();
  }

  var loaded = loadStatsFromDisk();
  loadBillboardPos();
  // Re-apply forceload for any billboard positions that survived across restarts.
  // loadBillboardPos() restores JS state but does not re-run the forceload command.
  var _bRestoreModes = ['combined', 'elim', 'tdm', 'combined_session', 'elim_session', 'tdm_session'];
  for (var _bri = 0; _bri < _bRestoreModes.length; _bri++) {
    var _brp = billboardPositions[_bRestoreModes[_bri]];
    if (_brp) event.server.runCommandSilent('execute in minecraft:overworld run forceload add ' + _brp.x + ' ' + _brp.z);
  }

  // Push authoritative disk stats to online players' NBT.
  // Pulling FROM players here could overwrite clean JSON data with zeroed NBT
  // (e.g. after a /reload that clears persistentData).
  if (event.server && event.server.players) {
    event.server.players.forEach(function(p) {
      if (!p) return;
      var name = p.name && p.name.string ? p.name.string : null;
      if (!name) return;
      if (stats[String(p.uuid)]) { saveEntryToPlayer(p); } else { loadEntryFromPlayer(p); }
    });
  }
  // Refresh board text immediately on startup so boards are current before the first tick interval.
  try { updateBillboard(event.server); } catch (_bbLoadErr) { console.error('[Gambit Load] billboard update failed: ' + _bbLoadErr); }
  if (loaded) saveStatsToDisk();
});

// ── Player login ──────────────────────────────────────────────
PlayerEvents.loggedIn(function(event) {
  var player = event.player;
  var name   = player && player.name && player.name.string ? player.name.string : null;
  if (!name) return;

  // OPs are exempt from forced gamemode and spawn TP so they can work on maps freely.
  if (!player.hasPermissions(2)) {
    player.server.runCommandSilent('gamemode adventure ' + name);
    player.server.runCommandSilent('execute in minecraft:overworld run tp ' + name + ' 0 101 0');
  }

  // Ensure player is in lobby team (covers first-ever login and post-reload edge cases)
  player.server.runCommandSilent('team join lobby ' + name);

  // Mid-match join: auto-spectate so the player isn't stranded at spawn.
  if (!player.hasPermissions(2)
      && typeof matchActive !== 'undefined' && matchActive
      && typeof currentMapId !== 'undefined' && currentMapId !== 0) {
    var _joinMap = typeof getMapById === 'function' ? getMapById(currentMapId) : null;
    player.server.runCommandSilent('gamemode spectator ' + name);
    if (_joinMap && _joinMap.spectator) {
      player.server.runCommandSilent('execute in minecraft:overworld run tp ' + name + ' ' + _joinMap.spectator);
    }
    player.tell('§e[Gambit] A match was in progress when you joined — you have been placed into spectator mode.');
  }

  // Reset down counter on join so a disconnect/reconnect between matches starts clean.
  writeTagNumber(player.persistentData, PD_DOWNS, 0, true);
  player.server.runCommandSilent('scoreboard players set ' + name + ' gun_downs 0');

  if (stats[String(player.uuid)]) { saveEntryToPlayer(player); return; }
  loadEntryFromPlayer(player);
  markStatsDirty();

  // Give the guide book directly — more reliable than the lobby tick command chain.
  if (typeof _giveGuideBook === 'function') _giveGuideBook(player);
});

// ── Respawn ───────────────────────────────────────────────────
EntityEvents.spawned('minecraft:player', function(event) {
  // Reset PD_DOWNS on every spawn/respawn (covers TDM respawns where EntityEvents.death
  // may have already fired but persistent data can get reloaded with stale values).
  var player = event.entity;
  var name   = player && player.name && player.name.string ? player.name.string : null;
  if (!name) return;
  writeTagNumber(player.persistentData, PD_DOWNS, 0, true);
  // Scoreboard is also reset in respawn_player.mcfunction, but belt-and-suspenders.
  player.server.runCommandSilent('scoreboard players set ' + name + ' gun_downs 0');
});

// ── Player logout ─────────────────────────────────────────────
PlayerEvents.loggedOut(function(event) {
  var player = event.player;
  var name   = player && player.name && player.name.string ? player.name.string : null;
  if (!name) return;

  var server = player.server;

  // Team tags
  server.runCommandSilent('tag ' + name + ' remove Red');
  server.runCommandSilent('tag ' + name + ' remove Blue');

  // Death / respawn tags
  server.runCommandSilent('tag ' + name + ' remove gun_dead');
  server.runCommandSilent('tag ' + name + ' remove gun_just_died');
  server.runCommandSilent('tag ' + name + ' remove gun_spec_tp_pending');

  // Queue opt-out
  server.runCommandSilent('tag ' + name + ' remove gun_optout');

  // Kit tags — loop over VALID_KITS so new kits only need to be added in one place
  for (var ki = 0; ki < VALID_KITS.length; ki++) {
    server.runCommandSilent('tag ' + name + ' remove ' + VALID_KITS[ki]);
  }

  // Scoreboard timers / counters
  server.runCommandSilent('scoreboard players set ' + name + ' tdm_respawn_timer 0');
  server.runCommandSilent('scoreboard players set ' + name + ' spec_respawn_timer 0');
  server.runCommandSilent('scoreboard players set ' + name + ' gun_downs 0');

  // Reset gamemode, inventory, effects, and spawnpoint (OPs keep their gamemode and inventory)
  if (!player.hasPermissions(2)) {
    server.runCommandSilent('gamemode adventure ' + name);
    server.runCommandSilent('clear ' + name);
  }
  server.runCommandSilent('effect clear ' + name);
  server.runCommandSilent('spawnpoint ' + name + ' 0 101 0');

  // Place back in lobby team
  server.runCommandSilent('team join lobby ' + name);

  // Persist stats so a restart never loses data for this player.
  // saveEntryToPlayer writes to NBT; saveStatsToDisk flushes to JSON immediately.
  if (stats[String(player.uuid)]) {
    saveEntryToPlayer(player);
    saveStatsToDisk();
  }

  // Clear in-memory tracking state for this player
  delete currentStreaks[name];
  delete syringeCounts[name];
  delete recentlyDowned[name];
  delete downerNames[name];
  delete firstDownerNames[name];
  delete executionKillerNames[name];
  delete executionAnnouncements[name];
});

// ── Server unload ────────────────────────────────────────────
// Flush stats on graceful shutdown/reload to reduce restart-loss windows.
ServerEvents.unloaded(function(event) {
  try {
    if (typeof saveStatsToDisk === 'function') saveStatsToDisk();
  } catch (_uErr) {
    console.error('[Gambit Stats] Unload flush failed: ' + _uErr);
  }
});

// ── Server tick ───────────────────────────────────────────────
ServerEvents.tick(function(event) {
  // Keep per-day session stats aligned with local calendar rollover.
  if (typeof rolloverSessionStatsIfNeeded === 'function') rolloverSessionStatsIfNeeded();

  // ── Attacker cache cleanup + periodic stat save ───────────
  attackerCacheCleanupTicker += 1;
  if (attackerCacheCleanupTicker >= ATTACKER_CACHE_CLEANUP_INTERVAL_TICKS) {
    attackerCacheCleanupTicker = 0;
    cleanupExpiredAttackerCache();
    statsSaveTicker += ATTACKER_CACHE_CLEANUP_INTERVAL_TICKS;
    if (statsDirty && statsSaveTicker >= STATS_FLUSH_INTERVAL_TICKS) {
      try {
        saveStatsToDisk();
      } catch (_saveErr) {
        console.error('[Gambit Tick] stats flush failed: ' + _saveErr);
      }
    }

    var _eaNow = Date.now();
    var _eaKeys = Object.keys(executionAnnouncements);
    for (var _eai = 0; _eai < _eaKeys.length; _eai++) {
      var _eaName = _eaKeys[_eai];
      if (_eaNow >= executionAnnouncements[_eaName]) delete executionAnnouncements[_eaName];
    }
  }

  // ── Billboard refresh ─────────────────────────────────────
  billboardUpdateTicker += 1;
  if (billboardUpdateTicker >= BILLBOARD_UPDATE_INTERVAL_TICKS) {
    billboardUpdateTicker = 0;
    try {
      updateBillboard(event.server);
    } catch (_bbErr) {
      console.error('[Gambit Tick] billboard update failed: ' + _bbErr);
    }
  }

  // ── Kit usage analytics ───────────────────────────────────
  analyticsKitTicker += 1;
  if (analyticsKitTicker >= 20) {
    analyticsKitTicker = 0;
    var _isMatchLive = !(typeof matchActive !== 'undefined' && !matchActive);
    if (_isMatchLive && event.server && event.server.players) {
      var seen = {};
      event.server.players.forEach(function(p) {
        if (!p) return;
        var _pid = _analyticsGetPlayerId(p);
        if (!_pid) return;

        var _isRed = hasTagSafe(p, 'Red');
        var _isBlue = hasTagSafe(p, 'Blue');
        if (!_isRed && !_isBlue) {
          if (analyticsKitStates[_pid]) _analyticsCloseKitSegment(_pid, Date.now(), 'team_exit');
          return;
        }

        seen[_pid] = true;
        var currentKit = _analyticsDetectCurrentKit(p);
        var state = analyticsKitStates[_pid];
        if (!state && currentKit) {
          _analyticsOpenKitSegment(p, currentKit, Date.now(), true);
          return;
        }
        if (!state) return;
        if (!currentKit) {
          _analyticsCloseKitSegment(_pid, Date.now(), 'clear');
          return;
        }
        if (state.kit_key !== currentKit) {
          _analyticsCloseKitSegment(_pid, Date.now(), 'swap');
          _analyticsOpenKitSegment(p, currentKit, Date.now(), false);
        }
      });

      var activeIds = Object.keys(analyticsKitStates);
      for (var _ai = 0; _ai < activeIds.length; _ai++) {
        var _id = activeIds[_ai];
        if (!seen[_id]) _analyticsCloseKitSegment(_id, Date.now(), 'left');
      }
    }
  }

  // ── Revive tracking ───────────────────────────────────────
  // Poll syringe counts every 10 ticks for in-match players.
  // marbledsfirstaid:syringe is consumed on use. Any decrease in count while the
  // player has a Red or Blue tag and a downed teammate is nearby counts as a revive.
  reviveCheckTicker += 1;
  if (reviveCheckTicker >= 10) {
    reviveCheckTicker = 0;
    if (event.server && event.server.players) {
      event.server.players.forEach(function(p) {
        if (!p) return;
        var pName = p.name && p.name.string ? p.name.string : null;
        if (!pName) return;
        if (!hasTagSafe(p, 'Red') && !hasTagSafe(p, 'Blue')) return;

        var currentCount = 0;
        try {
          var inv     = p.inventory;
          var invSize = inv.getContainerSize ? inv.getContainerSize() : 41;
          for (var _si = 0; _si < invSize; _si++) {
            var _stack = inv.getItem(_si);
            if (_stack && !_stack.isEmpty() && String(_stack.id) === 'marbledsfirstaid:syringe') {
              currentCount += _stack.getCount();
            }
          }
        } catch (_se) {}

        var prevCount = syringeCounts[pName];
        if (typeof prevCount === 'number' && currentCount < prevCount) {
          // Only credit when a downed player is within 4 blocks of the reviver.
          var _now          = Date.now();
          var _rdKeys       = Object.keys(recentlyDowned);
          var _creditedRdName = null;
          for (var _ri = _rdKeys.length - 1; _ri >= 0; _ri--) {
            var _rdName = _rdKeys[_ri];
            if (_now >= recentlyDowned[_rdName]) { delete recentlyDowned[_rdName]; continue; }
            var _downedP = getOnlinePlayerByName(event.server, _rdName);
            if (!_downedP) continue;
            var _dx = _downedP.x - p.x;
            var _dy = _downedP.y - p.y;
            var _dz = _downedP.z - p.z;
            if ((_dx*_dx + _dy*_dy + _dz*_dz) <= 16) { _creditedRdName = _rdName; break; }
          }
          if (_creditedRdName) {
            if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
              loadEntryFromPlayer(p);
              var reviverEntry = getEntry(pName);
              reviverEntry.revives = (reviverEntry.revives || 0) + 1;
              if (!reviverEntry.session || reviverEntry.session.date !== getTodayDateString()) reviverEntry.session = makeDefaultSession();
              reviverEntry.session.revives = (reviverEntry.session.revives || 0) + 1;
              markStatsDirty();
              saveEntryToPlayer(p);
            }
            // Consume the downed window so no second syringe use near the same player
            // causes a duplicate revive credit.
            delete recentlyDowned[_creditedRdName];
          }
        }
        syringeCounts[pName] = currentCount;
      });
    }
  }
});

// ── Damage event ──────────────────────────────────────────────
// source.immediate = the EntityKineticBullet (type: tacz:bullet)
// source.player    = the player who fired the gun
EntityEvents.hurt(function(event) {
  var entity = event.entity;
  var source = event.source;
  var damage = event.damage;

  // Guard: skip re-entry from other finisher or execution damage.
  var _srcMsgId = '';
  try { _srcMsgId = String(source.getMsgId()); } catch (e) {
    try { _srcMsgId = String(source.type().msgId()); } catch (e2) {}
  }
  if (_srcMsgId === 'gambit.execution' || _srcMsgId === 'gambit:execution') return;

  // ── Lobby damage immunity ─────────────────────────────────
  if (entity.player && hasTagSafe(entity, 'gun_in_lobby')) {
    event.cancel();
    return;
  }

  // ── Sword execution trigger ───────────────────────────────────────────────
  // Resolve attacker — source.player is null for melee in KubeJS 1.20.1;
  // fall back to source.entity / source.directEntity.
  var _fAttacker = null;
  try { if (source.player) _fAttacker = source.player; } catch (_fe1) {}
  if (!_fAttacker) { try { var _fse = source.entity;       if (_fse && _fse.mainHandItem) _fAttacker = _fse; } catch (_fe2) {} }
  if (!_fAttacker) { try { var _fde = source.directEntity; if (_fde && _fde.mainHandItem) _fAttacker = _fde; } catch (_fe3) {} }

  if (_fAttacker && entity && entity.player) {
    var _fItem = null;
    try { _fItem = _fAttacker.mainHandItem; } catch (_fie) {}
    var _isIronSword = false;
    if (_fItem) {
      try { _isIronSword = (String(_fItem.id) === 'minecraft:iron_sword'); } catch (_fie2) {}
    }
    if (_isIronSword) {
      var _hurtMatchActive = typeof matchActive === 'undefined' || matchActive;
      var _fVName = entity.name && entity.name.string ? entity.name.string : null;
      var _fKName = _fAttacker.name && _fAttacker.name.string ? _fAttacker.name.string : null;
      var _fCross = (hasTagSafe(entity, 'Red') && hasTagSafe(_fAttacker, 'Blue'))
                 || (hasTagSafe(entity, 'Blue') && hasTagSafe(_fAttacker, 'Red'));
      var _hasBleedingEffect = hasPlayerReviveBleeding(entity);
      var _inDownedWindow = _fVName && recentlyDowned[_fVName] && Date.now() < recentlyDowned[_fVName];
      // Mirror gun execution flow: sword hit on a downed enemy sends custom execution damage.
      if (_hurtMatchActive && _fVName && _fKName && _fCross && (_hasBleedingEffect || _inDownedWindow)) {
        // Record killer attribution for death handler before applying execution damage.
        executionKillerNames[_fVName] = _fKName;
        // Suppress vanilla death text for this execution BEFORE applying lethal damage.
        event.server.runCommandSilent('gamerule showDeathMessages false');
        // Announce BEFORE applying damage so executionAnnouncements is set when
        // EntityEvents.death fires synchronously inside the damage command,
        // preventing the death handler's fallback from sending a duplicate message.
        announceExecutionFeedAndFx(event.server, _fVName, _fKName);
        // Apply execution damage (kills the entity).
        event.server.runCommandSilent('damage ' + _fVName + ' 1000 gambit:execution');
      }
      return;
    }
  }

  // ── TACZ stats tracking ───────────────────────────────────
  var bullet      = source.immediate;
  var isTaczBullet = bullet && bullet.type.toString().indexOf('tacz') !== -1;
  var _hurtMatchActive = typeof matchActive === 'undefined' || matchActive;
  if (isTaczBullet) {
    var shooter = source.player;
    if (shooter) {
      var shooterName  = shooter.name.string;
      if (_hurtMatchActive) {
        var entry        = getEntry(shooterName);
        var roundEntry   = getRoundEntry(shooterName);
        // Cap to remaining health to avoid overkill inflation
        var actualDamage = Math.min(damage, entity.health);
        if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) entry.damage += actualDamage;
        roundEntry.damage += actualDamage;
        var _dmgInt = Math.floor(actualDamage);
        if (_dmgInt > 0) event.server.runCommandSilent('scoreboard players add ' + shooterName + ' life_dmg ' + _dmgInt);
        if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) saveEntryToPlayer(shooter);
      }
      if (entity && entity.player) {
        // Only track cross-team hits — skip friendly fire so teammates can't
        // steal kill credit or assist credit.
        var _enemyTeam = (hasTagSafe(entity, 'Red') && hasTagSafe(shooter, 'Blue'))
                      || (hasTagSafe(entity, 'Blue') && hasTagSafe(shooter, 'Red'))
                      || (!hasTagSafe(entity, 'Red') && !hasTagSafe(entity, 'Blue'));
        if (_enemyTeam) rememberRecentAttacker(entity, shooter);
      }
    }
  }

  // ── Down limit ────────────────────────────────────────────
  if (entity && entity.player
      && (hasTagSafe(entity, 'Red') || hasTagSafe(entity, 'Blue'))
      && !hasTagSafe(entity, 'gun_just_died')
      && damage >= entity.health
      && _hurtMatchActive) {

    var srcMsgId  = '';
    try { srcMsgId = String(source.getMsgId()); } catch (e) {}
    if (srcMsgId === 'gambit.execution' || srcMsgId === 'gambit:execution') return;

    // Tournament mode: bypass PlayerRevive downing — every lethal hit is an immediate kill.
    if (typeof tournamentMode !== 'undefined' && tournamentMode) {
      var tVictimName = entity.name && entity.name.string ? entity.name.string : null;
      if (tVictimName) {
        var tVictimId   = getPlayerId(entity);
        var tDowner     = tVictimId ? recentPlayerAttackers[tVictimId] : null;
        var tDownerName = tDowner ? (tDowner.last || null) : null;
        if (tDownerName) executionKillerNames[tVictimName] = tDownerName;
        writeTagNumber(entity.persistentData, PD_DOWNS, 0, true);
        event.server.runCommandSilent('scoreboard players set ' + tVictimName + ' gun_downs 0');
        event.server.runCommandSilent('gamerule showDeathMessages false');
        event.server.runCommandSilent('damage ' + tVictimName + ' 1000 gambit:execution');
      }
      return;
    }

    var isBypassed = downsConfig.bypass_source_types.indexOf(srcMsgId) !== -1;
    if (!downsConfig.enabled || isBypassed) return;

    var victimName = entity.name && entity.name.string ? entity.name.string : null;
    var currentDowns = Math.floor(readTagNumber(entity.persistentData, PD_DOWNS, 0));

    // Peek at attacker cache (don't consume — EntityEvents.death still needs it).
    var victimId      = getPlayerId(entity);
    var downerCached  = victimId ? recentPlayerAttackers[victimId] : null;
    var downerNameHurt = downerCached ? (downerCached.last || null) : null;

    // Store downer for bleed-out kill credit (always updated to most recent downer).
    // firstDownerNames is set once per life and never overwritten — used for assist credit.
    // Only set when the downer is on the opposite team (block friendly-fire credit).
    if (downerNameHurt && victimName && downerNameHurt !== victimName) {
      var _downerP = getOnlinePlayerByName(event.server, downerNameHurt);
      var _friendlyFire = _downerP && (
        (hasTagSafe(entity, 'Red')  && hasTagSafe(_downerP, 'Red')) ||
        (hasTagSafe(entity, 'Blue') && hasTagSafe(_downerP, 'Blue'))
      );
      if (!_friendlyFire) {
        downerNames[victimName] = downerNameHurt;
        if (!firstDownerNames[victimName]) firstDownerNames[victimName] = downerNameHurt;
      }
    }

    // If the player is already in a downed window, do not re-run down-cap execution
    // logic. Let the incoming damage resolve naturally so vanilla death attribution
    // (e.g. "was shot by") is preserved for normal finish shots.
    if (victimName && recentlyDowned[victimName] && Date.now() < recentlyDowned[victimName]) return;

    // If this lethal hit would reach the down cap, execute immediately.
    if ((currentDowns + 1) >= downsConfig.max_downs && victimName) {
      // Guard: execution already in flight for this player — skip duplicate trigger.
      if (executionAnnouncements[victimName] && Date.now() < executionAnnouncements[victimName]) return;
      if (downerNameHurt) executionKillerNames[victimName] = downerNameHurt;
      announceExecutionFeedAndFx(event.server, victimName, downerNameHurt);
      delete recentlyDowned[victimName];
      // Suppress vanilla death text for this execution before applying lethal damage.
      event.server.runCommandSilent('gamerule showDeathMessages false');
      event.server.runCommandSilent('damage ' + victimName + ' 1000 gambit:execution');
      // Keep vanilla death messages off (custom kill feed is authoritative).
      event.server.runCommandSilent('gamerule showDeathMessages false');
      return;
    }

    var newDowns = currentDowns + 1;
    writeTagNumber(entity.persistentData, PD_DOWNS, newDowns, true);
    if (victimName) {
      event.server.runCommandSilent('scoreboard players set ' + victimName + ' gun_downs ' + newDowns);
      recentlyDowned[victimName] = Date.now() + DOWNED_WINDOW_MS;
    }
    // Down confirmation sound — played only to the downer.
    if (downerNameHurt && downerNameHurt !== victimName) {
      event.server.runCommandSilent('execute as ' + downerNameHurt + ' at @s run playsound minecraft:block.note_block.bass master @s ~ ~ ~ 1.5 1.0');
      event.server.runCommandSilent('execute as ' + downerNameHurt + ' at @s run playsound minecraft:entity.hostile.big_fall master @s ~ ~ ~ 1.5 0.7');
    }
  }
});

// ── Death event ───────────────────────────────────────────────
EntityEvents.death(function(event) {
  // Disable vanilla death messages immediately to prevent duplicates.
  // This must run at the start before any other logic.
  event.server.runCommandSilent('gamerule showDeathMessages false');

  var dead = event.entity;
  if (!dead || !dead.player) return;

  var deadName = dead.name && dead.name.string ? dead.name.string : null;
  if (!deadName) return;

  // PlayerRevive cancels LivingDeathEvent (HIGH priority) before KubeJS sees it,
  // so this handler only fires for true final deaths: gambit:execution and bled_to_death.
  var sourceId  = '';
  try { sourceId = String(event.source.getMsgId()); } catch (e) {}
  var isExecution = (sourceId === 'gambit.execution' || sourceId === 'gambit:execution');
  var isBleedOut = (sourceId === 'bled_to_death');
  // True when an execution was announced in EntityEvents.hurt but the final death arrived
  // with a non-execution source (e.g. player was in recentlyDowned but not yet in
  // PlayerRevive's bleeding state, so the raw bullet/sword damage killed them first).
  var _priorExecution = !isExecution && !!executionAnnouncements[deadName] && Date.now() < executionAnnouncements[deadName];

  var _attackInfo = consumeRecentAttackInfo(dead);
  var killerName  = _attackInfo.killerName;

  currentStreaks[deadName] = 0;
  delete recentlyDowned[deadName];

  // Cancel any queued execution — they're already dead.
  // (No longer queued since executions now run immediately on hit)

  writeTagNumber(dead.persistentData, PD_DOWNS, 0, true);
  event.server.runCommandSilent('scoreboard players set ' + deadName + ' gun_downs 0');

  if (typeof matchActive === 'undefined' || matchActive) {
    var entry      = getEntry(deadName);
    if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
      entry.deaths += 1;
      var _dMode = (typeof currentModeId !== 'undefined') ? currentModeId : -1;
      if (_dMode === 1) entry.tdm_deaths  = (entry.tdm_deaths  || 0) + 1;
      else              entry.elim_deaths = (entry.elim_deaths || 0) + 1;
    }
    var deadRoundEntry = getRoundEntry(deadName);
    deadRoundEntry.deaths = (deadRoundEntry.deaths || 0) + 1;
    if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) saveEntryToPlayer(dead);
  }

  // Finisher execution has priority — direct kill attribution
  if ((!killerName || killerName === deadName) && executionKillerNames[deadName]) {
    killerName = executionKillerNames[deadName] || null;
  }
  // Bleed-out fallback: attacker cache may have expired (bleed timer is 60s, cache TTL is 15s)
  if ((!killerName || killerName === deadName) && isBleedOut) {
    killerName = downerNames[deadName] || null;
  }
  // Execution fallback: use the original downer if finisher attribution is unavailable
  if ((!killerName || killerName === deadName) && isExecution) {
    killerName = downerNames[deadName] || null;
  }

  // Execution fallback: if we did not announce at trigger time, do it now.
  if (isExecution) {
    if (!executionAnnouncements[deadName] || Date.now() >= executionAnnouncements[deadName]) {
      announceExecutionFeedAndFx(event.server, deadName, killerName);
    }
    delete executionAnnouncements[deadName];
  } else if (_priorExecution) {
    // Execution was announced in hurt handler — clean up the entry.
    delete executionAnnouncements[deadName];
  }

  delete executionKillerNames[deadName];
  delete downerNames[deadName];
  var firstDowner = firstDownerNames[deadName];
  delete firstDownerNames[deadName];

  if (!killerName || killerName === deadName) return;
  if (!(typeof matchActive === 'undefined' || matchActive)) return;

  var killerPlayer = getOnlinePlayerByName(event.server, killerName);
  if (killerPlayer) loadEntryFromPlayer(killerPlayer);

  var killerEntry      = getEntry(killerName);
  var killerRoundEntry = getRoundEntry(killerName);
  if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
    killerEntry.kills += 1;
    var _kMode = (typeof currentModeId !== 'undefined') ? currentModeId : -1;
    if (_kMode === 1) killerEntry.tdm_kills  = (killerEntry.tdm_kills  || 0) + 1;
    else              killerEntry.elim_kills = (killerEntry.elim_kills || 0) + 1;
  }
  killerRoundEntry.kills += 1;
  event.server.runCommandSilent('scoreboard players add ' + killerName + ' life_kills 1');

  // Custom kill announcement (skip for executions — they have their own "was finished by" message).
  // Also skip when an execution was already announced via the hurt handler (_priorExecution).
  if (!isExecution && !_priorExecution) {
    var _kTeam = killerPlayer
      ? (hasTagSafe(killerPlayer, 'Red') ? 'Red' : (hasTagSafe(killerPlayer, 'Blue') ? 'Blue' : 'Unknown'))
      : 'Unknown';
    var _vTeam = dead
      ? (hasTagSafe(dead, 'Red') ? 'Red' : (hasTagSafe(dead, 'Blue') ? 'Blue' : 'Unknown'))
      : 'Unknown';
    var _kColor = _kTeam === 'Red' ? 'red' : (_kTeam === 'Blue' ? 'aqua' : 'white');
    var _vColor = _vTeam === 'Red' ? 'red' : (_vTeam === 'Blue' ? 'aqua' : 'white');
    var _isTournament = typeof tournamentMode !== 'undefined' && tournamentMode;
    var _killPool = _isTournament ? _TOURNAMENT_KILL_MSGS : _KILL_MSGS;
    var _killText = _killPool[Math.floor(Math.random() * _killPool.length)];
    event.server.runCommandSilent('tellraw @a ["",' +
      '{"text":"[' + _vTeam + '] ","color":"' + _vColor + '"},' +
      '{"text":"' + deadName + '","color":"' + _vColor + '"},' +
      '{"text":"' + _killText + '","color":"white"},' +
      '{"text":"[' + _kTeam + '] ","color":"' + _kColor + '"},' +
      '{"text":"' + killerName + '","color":"' + _kColor + '"}' +
    ']');
  }

  // First blood announcement (suppressed in tournament mode).
  if (!firstBloodDone && !(typeof tournamentMode !== 'undefined' && tournamentMode)) {
    firstBloodDone = true;
    var _kColor = killerPlayer
      ? (hasTagSafe(killerPlayer, 'Red') ? 'red' : (hasTagSafe(killerPlayer, 'Blue') ? 'aqua' : 'red'))
      : 'red';
    var _vColor = dead
      ? (hasTagSafe(dead, 'Red') ? 'red' : (hasTagSafe(dead, 'Blue') ? 'aqua' : 'red'))
      : 'red';
    var _fbMsg = _FIRST_BLOOD_MSGS[Math.floor(Math.random() * _FIRST_BLOOD_MSGS.length)];
    event.server.runCommandSilent('tellraw @a ["",' +
      '{"text":"\u2620 FIRST BLOOD ","color":"dark_red","bold":true},' +
      '{"text":"' + killerName.replace(/"/g, '') + '","color":"' + _kColor + '","bold":true},' +
      '{"text":"' + _fbMsg + '","color":"dark_red","bold":true},' +
      '{"text":"' + deadName.replace(/"/g, '') + '","color":"' + _vColor + '","bold":true}' +
    ']');
  }

  // Kill streak tracking.
  currentStreaks[killerName] = (currentStreaks[killerName] || 0) + 1;
  var streak = currentStreaks[killerName];
  // Kill confirmation sound — sharp high-pitched pling played only to the killer.
  // Suppressed when a killstreak fires this same kill (streak replaces kill sound).
  var _isStreakKill = streak >= 4 && streak % 4 === 0;
  if (killerPlayer && !_isStreakKill) {
    event.server.runCommandSilent('execute as ' + killerName + ' at @s run playsound minecraft:entity.horse.land master @s ~ ~ ~ 1.5 2');
    event.server.runCommandSilent('execute as ' + killerName + ' at @s run playsound minecraft:entity.experience_orb.pickup master @s ~ ~ ~ 1.5 2');
  }
  if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
    if (streak > (killerEntry.longest_streak || 0)) killerEntry.longest_streak = streak;
    if (!killerEntry.session || killerEntry.session.date !== getTodayDateString()) killerEntry.session = makeDefaultSession();
    if (streak > (killerEntry.session.longest_streak || 0)) killerEntry.session.longest_streak = streak;
  }

  // Killstreak sound — plays on reward milestones (multiples of 4), only for the killer.
  if (killerPlayer && _isStreakKill) {
    event.server.runCommandSilent('execute as ' + killerName + ' at @s run playsound minecraft:block.bell.use master @s ~ ~ ~ 1.5 1.5');
  }

  // TDM kill streak rewards + announcements.
  var _isTdm = typeof currentModeId !== 'undefined' && currentModeId === 1;
  if (_isTdm && killerPlayer && streak >= 4 && streak % 4 === 0) {
    var _kColorStreak = hasTagSafe(killerPlayer, 'Red') ? 'red' : 'aqua';
    event.server.runCommandSilent('tellraw @a ["",' +
      '{"text":"' + killerName.replace(/"/g, '') + '","color":"' + _kColorStreak + '","bold":true},' +
      '{"text":" is on a ' + streak + '-kill streak!","color":"gold","bold":true}' +
    ']');
    if      (streak === 4)  killerPlayer.give(Item.of('minecraft:golden_apple', 3));
    else if (streak === 8)  killerPlayer.give(Item.of('marbledsfirstaid:panacea_pills', 1));
    else if (streak === 12) killerPlayer.give(Item.of('marbledsfirstaid:morphine', 1));
    else if (streak === 16) killerPlayer.give(Item.of('marbledsfirstaid:panacea_pills', 1));
    else if (streak === 20) {
      killerPlayer.give(Item.of('minecraft:golden_apple', 3));
      killerPlayer.give(Item.of('marbledsfirstaid:bandages', 5));
    }
    else if (streak === 24) killerPlayer.give(Item.of('minecraft:enchanted_golden_apple', 1));
    killerPlayer.give(Item.of('minecraft:golden_carrot', 4, '{display:{Name:\'{"text":"Golden Rations","italic":false}\'}}'));
  }

  if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
    markStatsDirty();
    if (killerPlayer) saveEntryToPlayer(killerPlayer);
  }

  // Assists: only credit the first player who downed the victim this life.
  var _assistSet = {};
  if (firstDowner && firstDowner !== killerName && firstDowner !== deadName) {
    _assistSet[firstDowner] = true;
  }
  var _assistList = Object.keys(_assistSet);
  for (var _aci = 0; _aci < _assistList.length; _aci++) {
    var _assistorName   = _assistList[_aci];
    var _assistorPlayer = getOnlinePlayerByName(event.server, _assistorName);
    if (_assistorPlayer) loadEntryFromPlayer(_assistorPlayer);
    var _assistorEntry      = getEntry(_assistorName);
    if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) _assistorEntry.assists = (_assistorEntry.assists || 0) + 1;
    var _assistorRoundEntry = getRoundEntry(_assistorName);
    _assistorRoundEntry.assists = (_assistorRoundEntry.assists || 0) + 1;
    if (typeof statsTrackingEnabled === 'undefined' || statsTrackingEnabled) {
      markStatsDirty();
      if (_assistorPlayer) saveEntryToPlayer(_assistorPlayer);
    }
    if (_assistorPlayer) {
      var _assistorIsRed  = hasTagSafe(_assistorPlayer, 'Red');
      var _deadColor      = _assistorIsRed ? '§b' : '§c'; // enemy = opposite team
      var _finishColor    = _assistorIsRed ? '§c' : '§b'; // finisher = same team
      _assistorPlayer.tell('§7[§eAssist§7] You helped take down ' + _deadColor + deadName + '§7, finished by ' + _finishColor + killerName + '§7.');
    }
  }
});

loadKillMessages();
loadDownsConfig();
