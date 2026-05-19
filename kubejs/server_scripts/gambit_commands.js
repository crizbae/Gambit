// ============================================================
// Gambit Commands
//
// All ServerEvents.commandRegistry registrations consolidated
// into a single block (Item 4).
//
//   /stats [subcommand]        — stats lookup and leaderboards
//   gambit_log_match <winner>  — log match result (internal)
//   /gambitboard <subcommand>  — manage leaderboard billboards (OP)
//   gambit_reset_downs         — reset down state for new match (internal)
//   gambit_set_downs <n>       — debug: set your down count (OP)
//   gambit_wipe_match_logs confirm — wipe match DB rows only (internal)
//   /gambitdb status|reconnect|testlog  — diagnose MySQL connection (OP)
//
// Depends on: gambit_stats.js, gambit_billboard.js, gambit_tracker.js
// (all loaded before commands dispatch at runtime regardless of file order)
// ============================================================

var StringArgumentType  = Java.loadClass('com.mojang.brigadier.arguments.StringArgumentType');
var IntegerArgumentType = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType');

// Suggestion provider helpers
function suggestPlayers(ctx, builder) {
  try { ctx.source.server.players.forEach(function(p) { builder.suggest(p.name.string); }); } catch(e) {}
  return builder.buildFuture();
}
function suggestTeamTargets(ctx, builder) {
  ['red', 'blue', 'all'].forEach(function(s) { builder.suggest(s); });
  try { ctx.source.server.players.forEach(function(p) { builder.suggest(p.name.string); }); } catch(e) {}
  return builder.buildFuture();
}
function suggestMetrics(ctx, builder) {
  ['kd','winpct','kills','deaths','damage','wins','matches','mvps','dpl','assists','streak','revives'].forEach(function(s) { builder.suggest(s); });
  return builder.buildFuture();
}
function suggestSessionMetrics(ctx, builder) {
  ['kd','winpct','kills','deaths','damage','wins','matches','mvps','dpl','assists','streak','revives'].forEach(function(s) { builder.suggest(s); });
  return builder.buildFuture();
}

function showElimGlobal(player) {
  if (!player || !player.tell) return;
  var sorted = getSortedEntriesByElimScore();
  var limit  = Math.min(10, sorted.length);
  player.tell('§6§l── Elim Leaderboard (Global) ──');
  player.tell('§7Score = (0.5×dmg) + (100×kills) + (50×assists) + (300 MVP) ÷ matches');
  for (var i = 0; i < limit; i++) {
    var _e = sorted[i][1];
    player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §2Score: §f' + getElimAvgScore(_e).toFixed(0) + ' §8| §bKD: §f' + getElimKD(_e).toFixed(2));
  }
  if (limit === 0) player.tell('§7No players have played ' + LEADERBOARD_MIN_MATCHES_MODE + '+ elimination matches yet.');
  player.tell('§6§l────────────────────────────────');
}

function showTdmGlobal(player) {
  if (!player || !player.tell) return;
  var sorted = getSortedEntriesByTdmScore();
  var limit  = Math.min(10, sorted.length);
  player.tell('§6§l── TDM Leaderboard (Global) ──');
  player.tell('§7Score = (0.25×dmg) + (100×kills) + (50×assists) - (100×deaths) + (500 MVP) ÷ matches');
  for (var i = 0; i < limit; i++) {
    var _e = sorted[i][1];
    player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §2Score: §f' + getTdmAvgScore(_e).toFixed(0) + ' §8| §bKD: §f' + getTdmKD(_e).toFixed(2));
  }
  if (limit === 0) player.tell('§7No players have played ' + LEADERBOARD_MIN_MATCHES_MODE + '+ TDM matches yet.');
  player.tell('§6§l───────────────────────');
}

function showCombinedGlobal(player) {
  if (!player || !player.tell) return;
  var sorted = getSortedEntries();
  var limit  = Math.min(10, sorted.length);
  player.tell('§6§l── Combined Leaderboard (Global) ──');
  player.tell('§7Score = avg of Elim and TDM score/match');
  if (limit === 0) {
    player.tell('§7No players with ' + LEADERBOARD_MIN_MATCHES_MODE + '+ elim and ' + LEADERBOARD_MIN_MATCHES_MODE + '+ TDM matches yet.');
  } else {
    for (var i = 0; i < limit; i++) {
      var e = sorted[i][1];
      player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §2Score: §f' + getCombinedAvgScore(e).toFixed(0) + ' §8| §bKD: §f' + getCombinedKD(e).toFixed(2));
    }
  }
  player.tell('§6§l──────────────────────────');
}

function showTopGlobal(ctx) {
  var player = ctx.source.player;
  if (!player || !player.tell) return 1;
  var metric = String(StringArgumentType.getString(ctx, 'metric')).toLowerCase();
  var label  = metricLabel(metric);
  if (!label) { player.tell('§e[Gambit Stats] Unknown metric "' + metric + '". Use: kd, winpct, damage, kills, deaths, wins, matches, mvps, dpl, assists, streak, revives.'); return 1; }
  if (statsSize() === 0) { player.tell('§7[Gambit Stats] No stats recorded yet.'); return 1; }
  var sorted = getSortedEntriesByMetric(metric);
  var limit  = Math.min(10, sorted.length);
  if (limit === 0) { player.tell('§7[Gambit Stats] No players with enough matches yet.'); return 1; }
  player.tell('§6§l── Top ' + limit + ' by ' + label + ' (Global) ──');
  for (var i = 0; i < limit; i++) {
    player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §f' + formatMetricValue(metricValue(sorted[i][1], metric), metric));
  }
  player.tell('§6§l──────────────────────────────');
  return 1;
}

function showTopSession(ctx) {
  var player = ctx.source.player;
  if (!player || !player.tell) return 1;
  var metric = String(StringArgumentType.getString(ctx, 'metric')).toLowerCase();
  var label  = sessionMetricLabel(metric);
  if (!label) { player.tell('§e[Gambit Stats] Unknown metric "' + metric + '". Use: kd, winpct, kills, deaths, damage, wins, matches, mvps, dpl, assists, streak, revives.'); return 1; }
  var sorted = getSortedEntriesBySessionMetric(metric);
  var limit  = Math.min(10, sorted.length);
  if (limit === 0) { player.tell('§7[Gambit Stats] No session data for today yet.'); return 1; }
  player.tell('§6§l── Top ' + limit + ' by ' + label + ' (Today) ──');
  for (var i = 0; i < limit; i++) {
    player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §f' + formatMetricValue(sessionMetricValue(sorted[i][1], metric), metric));
  }
  player.tell('§6§l──────────────────────────────');
  return 1;
}

function showSessionLeaderboard(player, mode) {
  if (!player || !player.tell) return;
  var sorted, scoreLabel, scoreFn, kdFn;
  if (mode === 'Elim') {
    sorted     = getSortedEntriesBySessionElimScore();
    scoreLabel = 'Elim Score';
    scoreFn    = function(s) { return _sessionElimScore(s); };
    kdFn       = function(s) { return (s.elim_kills||0) / Math.max(1, s.elim_deaths||0); };
  } else if (mode === 'TDM') {
    sorted     = getSortedEntriesBySessionTdmScore();
    scoreLabel = 'TDM Score';
    scoreFn    = function(s) { return _sessionTdmScore(s); };
    kdFn       = function(s) { return (s.tdm_kills||0) / Math.max(1, s.tdm_deaths||0); };
  } else {
    sorted     = getSortedEntriesBySessionCombinedScore();
    scoreLabel = 'Combined Score';
    scoreFn    = function(s) { return _sessionCombinedScore(s); };
    kdFn = function(s) {
      var k = (s.elim_kills||0) + (s.tdm_kills||0);
      var d = (s.elim_deaths||0) + (s.tdm_deaths||0);
      if (k === 0 && d === 0) return (s.deaths > 0 ? s.kills / s.deaths : (s.kills || 0)); // legacy fallback
      return k / Math.max(1, d);
    };
  }
  var limit = Math.min(10, sorted.length);
  player.tell('§6§l── ' + mode + ' Leaderboard (Today) ──');
  for (var i = 0; i < limit; i++) {
    var s  = sorted[i][1];
    var kd = kdFn(s).toFixed(2);
    player.tell('§7' + (i + 1) + '. §e' + sorted[i][0] + '§r — §2' + scoreLabel + ': §f' + scoreFn(s).toFixed(0) + ' §8| §bKD: §f' + kd);
  }
  if (limit === 0) player.tell('§7No players have session data for today yet.');
  player.tell('§6§l──────────────────────────');
}

// ── Guide book builder ──────────────────────────────────────────────────────
// Global so it can be called from PlayerEvents.loggedIn in gambit_tracker.js
// as well as from the gambit_give_guide command.
function _giveGuideBook(player) {
  if (!player || !player.give) return;

  // Build an SNBT single-quoted page string from a JS component array.
  // JSON.stringify converts \n to \\n in the JSON string output.
  // Doubling backslashes first ensures SNBT preserves them as-is so the
  // text component parser later sees a real newline escape sequence.
  function page(components) {
    var json = JSON.stringify(components)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    return "'" + json + "'";
  }

  var pages = [
    // ── Page 1: Cover ──
    page([
      { text: 'GAMBIT\n\n', color: 'dark_blue', bold: true },
      { text: 'A quick guide to\ngetting started.\n\n', color: 'dark_gray' },
      { text: 'Modes · Downs\nCommands · Items', color: 'black', italic: true }
    ]),

    // ── Page 2: Elimination ──
    page([
      { text: 'ELIMINATION\n\n', color: 'dark_red', bold: true },
      { text: 'One life each.\nWipe the enemy team\nto win the match.', color: 'black' }
    ]),

    // ── Page 3: Team Deathmatch ──
    page([
      { text: 'TEAM DEATHMATCH\n\n', color: 'dark_aqua', bold: true },
      { text: 'Respawns enabled.\nFirst team to reach\nthe kill target wins.', color: 'black' }
    ]),

    // ── Page 4: Down System ──
    page([
      { text: 'DOWN SYSTEM\n\n', color: 'dark_red', bold: true },
      { text: 'Lethal hits down you\ninstead of killing\nyou outright.\n\n', color: 'black' },
      { text: 'Teammates can revive\nyou with a syringe.\n\n', color: 'black' },
      { text: 'After 1 down, the\nnext lethal hit\nkills you. No revive.', color: 'black' }
    ]),

    // ── Page 5: Commands ──
    page([
      { text: 'COMMANDS\n\n', color: 'dark_blue', bold: true },
      { text: '/play\n', color: 'dark_green' },
      { text: 'Queue for a match.\n\n', color: 'black' },
      { text: '/spectate\n', color: 'dark_green' },
      { text: 'Watch without playing.\n\n', color: 'black' },
      { text: '/queue\n', color: 'dark_green' },
      { text: 'Check your status.\n\n', color: 'black' },
      { text: '/stats\n', color: 'dark_green' },
      { text: 'Full stats guide\nand leaderboards.', color: 'black' }
    ]),

    // ── Page 6: Items ──
    page([
      { text: 'ITEMS\n\n', color: 'dark_blue', bold: true },
      { text: 'Finisher\n', color: 'dark_red', bold: true },
      { text: 'Iron sword. Execute\ndowned enemies.\n\n', color: 'black' },
      { text: 'Syringe\n', color: 'aqua', bold: true },
      { text: 'Revives a downed\nteammate.\n\n', color: 'black' },
      { text: 'Pills & Morphine\n', color: 'green', bold: true },
      { text: 'Healing items given\nwith your kit.', color: 'black' }
    ]),
  ];

  var displayName = '{"text":"Gambit Field Manual","color":"gold","italic":false,"bold":true}';
  var nbt = '{title:"Gambit Field Manual",author:"Gambit Command",pages:[' + pages.join(',') + '],display:{Name:\'' + displayName + '\'}}';
  player.give(Item.of('minecraft:written_book', nbt));
}

ServerEvents.commandRegistry(function(event) {
  var Commands = event.commands;

  // ── /stats ────────────────────────────────────────────────
  event.register(
    Commands.literal('stats')

      // /stats — usage help
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player || !player.tell) return 1;
        player.tell('§6§l========================================');
        player.tell('§6§l              GAMBIT STATS              ');
        player.tell('§6§l========================================');
        player.tell('§8----------------------------------------');
        player.tell('§eProfile Cards');
        player.tell('§f/stats session §7[player]');
        player.tell('§f/stats global §7[player]');
        player.tell('§f/stats history §7[player]');
        player.tell('§8----------------------------------------');
        player.tell('§eLeaderboards');
        player.tell('§f/stats elim §7[global|session]');
        player.tell('§f/stats tdm §7[global|session]');
        player.tell('§f/stats combined §7[global|session]');
        player.tell('§8----------------------------------------');
        player.tell('§eTop 10 By Metric');
        player.tell('§f/stats top §7[global|session] <metric>');
        player.tell('§7Metrics: §fkd, winpct, kills, deaths, damage, wins, matches, mvps, dpl, assists, streak, revives');
        player.tell('§8----------------------------------------');
        player.tell('§cAdmin');
        player.tell('§f/stats admin §7(OP only)');
        player.tell('§6§l========================================');
        return 1;
      })

      // /stats session [playerName]
      .then(
        Commands.literal('session')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var name   = player && player.name && player.name.string ? player.name.string : null;
            if (!name) { if (player && player.tell) player.tell('§c[Gambit Stats] Unable to resolve your player name.'); return 1; }
            loadEntryFromPlayer(player);
            showSessionCard(player, name, getEntry(name));
            return 1;
          })
          .then(
            Commands.argument('playerName', StringArgumentType.word())
              .suggests(suggestPlayers)
              .executes(function(ctx) {
                var caller = ctx.source.player;
                if (!caller || !caller.tell) return 1;
                var target = StringArgumentType.getString(ctx, 'playerName');
                var resolvedKey = getExistingStatName(target);
                if (!resolvedKey) { caller.tell('§c[Gambit Stats] No stats found for "' + target + '".'); return 1; }
                var displayName = stats[resolvedKey] ? (stats[resolvedKey].name || resolvedKey) : resolvedKey;
                var targetPlayer = getOnlinePlayerByName(ctx.source.server, displayName);
                if (targetPlayer) loadEntryFromPlayer(targetPlayer);
                showSessionCard(caller, displayName, getEntry(resolvedKey));
                return 1;
              })
          )
      )

      // /stats global [playerName]
      .then(
        Commands.literal('global')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var name   = player && player.name && player.name.string ? player.name.string : null;
            if (!name) { if (player && player.tell) player.tell('§c[Gambit Stats] Unable to resolve your player name.'); return 1; }
            loadEntryFromPlayer(player);
            showStatsCard(player, name, getEntry(name));
            return 1;
          })
          .then(
            Commands.argument('playerName', StringArgumentType.word())
              .suggests(suggestPlayers)
              .executes(function(ctx) {
                var viewer      = ctx.source.player;
                if (!viewer || !viewer.tell) return 1;
                var targetInput = StringArgumentType.getString(ctx, 'playerName');
                var targetKey   = getExistingStatName(targetInput);
                if (!targetKey) {
                  var tp = getOnlinePlayerByName(ctx.source.server, targetInput);
                  if (tp) { loadEntryFromPlayer(tp); targetKey = String(tp.uuid); }
                }
                if (!targetKey || !stats[targetKey]) { viewer.tell('§c[Gambit Stats] No stats found for "' + targetInput + '".'); return 1; }
                var displayName = stats[targetKey].name || targetKey;
                var targetOnline = getOnlinePlayerByName(ctx.source.server, displayName);
                if (targetOnline) loadEntryFromPlayer(targetOnline);
                showStatsCard(viewer, displayName, stats[targetKey]);
                return 1;
              })
          )
      )

      // /stats history [playerName]
      .then(
        Commands.literal('history')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var name   = player && player.name && player.name.string ? player.name.string : null;
            if (!name) { if (player && player.tell) player.tell('§c[Gambit Stats] Unable to resolve your player name.'); return 1; }
            loadEntryFromPlayer(player);
            showMatchHistory(player, name, getEntry(name));
            return 1;
          })
          .then(
            Commands.argument('playerName', StringArgumentType.word())
              .suggests(suggestPlayers)
              .executes(function(ctx) {
                var caller = ctx.source.player;
                if (!caller || !caller.tell) return 1;
                var targetInput = StringArgumentType.getString(ctx, 'playerName');
                var targetKey   = getExistingStatName(targetInput);
                if (!targetKey) {
                  var tp = getOnlinePlayerByName(ctx.source.server, targetInput);
                  if (tp) { loadEntryFromPlayer(tp); targetKey = String(tp.uuid); }
                }
                if (!targetKey || !stats[targetKey]) { caller.tell('§c[Gambit Stats] No stats found for "' + targetInput + '".'); return 1; }
                var displayName = stats[targetKey].name || targetKey;
                var targetOnline = getOnlinePlayerByName(ctx.source.server, displayName);
                if (targetOnline) loadEntryFromPlayer(targetOnline);
                showMatchHistory(caller, displayName, stats[targetKey]);
                return 1;
              })
          )
      )

      // /stats top [global|session] <metric>
      .then(
        Commands.literal('top')
          .then(
            Commands.literal('global')
              .then(
                Commands.argument('metric', StringArgumentType.word())
                  .suggests(suggestMetrics)
                  .executes(function(ctx) { return showTopGlobal(ctx); })
              )
          )
          .then(
            Commands.literal('session')
              .then(
                Commands.argument('metric', StringArgumentType.word())
                  .suggests(suggestSessionMetrics)
                  .executes(function(ctx) { return showTopSession(ctx); })
              )
          )
          .then(
            Commands.argument('metric', StringArgumentType.word())
              .suggests(suggestMetrics)
              .executes(function(ctx) { return showTopGlobal(ctx); })
          )
      )

      // /stats postgame (server-only, hidden from autocomplete)
      .then(
        Commands.literal('postgame')
          .requires(function(src) { return !src.player; })
          .executes(function(ctx) {
            broadcastPostGameScoreboard(ctx.source.server);
            return 1;
          })
      )

      // /stats addmatch (server-only, hidden from autocomplete)
      .then(
        Commands.literal('addmatch')
          .requires(function(src) { return !src.player; })
          .then(
            Commands.argument('playerName', StringArgumentType.word())
              .suggests(suggestTeamTargets)
              .executes(function(ctx) {
                var target = StringArgumentType.getString(ctx, 'playerName');
                var caller = ctx.source.player;
                var result = applyMatchResult(ctx.source.server, target, true, false);
                if (result.count <= 0) { if (caller && caller.tell) caller.tell('§c[Gambit Stats] No valid online target for addmatch: "' + target + '".'); return 1; }
                if (caller && caller.tell) {
                  if (result.mode === 'player') { caller.tell('§a[Gambit Stats] Added match for ' + result.playerName + '. Matches: ' + result.entry.matches + ', W%: ' + getWinPct(result.entry).toFixed(1) + '%.'); }
                  else { caller.tell('§a[Gambit Stats] Added match for ' + result.count + ' player(s) in target "' + result.mode + '".'); }
                }
                return 1;
              })
          )
      )

      // /stats elim [global|session]
      .then(
        Commands.literal('elim')
          .executes(function(ctx) {
            showElimGlobal(ctx.source.player);
            return 1;
          })
          .then(
            Commands.literal('global')
              .executes(function(ctx) {
                showElimGlobal(ctx.source.player);
                return 1;
              })
          )
          .then(
            Commands.literal('session')
              .executes(function(ctx) {
                showSessionLeaderboard(ctx.source.player, 'Elim');
                return 1;
              })
          )
      )

      // /stats tdm [global|session]
      .then(
        Commands.literal('tdm')
          .executes(function(ctx) {
            showTdmGlobal(ctx.source.player);
            return 1;
          })
          .then(
            Commands.literal('global')
              .executes(function(ctx) {
                showTdmGlobal(ctx.source.player);
                return 1;
              })
          )
          .then(
            Commands.literal('session')
              .executes(function(ctx) {
                showSessionLeaderboard(ctx.source.player, 'TDM');
                return 1;
              })
          )
      )

      // /stats combined [global|session]
      .then(
        Commands.literal('combined')
          .executes(function(ctx) {
            showCombinedGlobal(ctx.source.player);
            return 1;
          })
          .then(
            Commands.literal('global')
              .executes(function(ctx) {
                showCombinedGlobal(ctx.source.player);
                return 1;
              })
          )
          .then(
            Commands.literal('session')
              .executes(function(ctx) {
                showSessionLeaderboard(ctx.source.player, 'Combined');
                return 1;
              })
          )
      )

      // /stats admin — OP management commands
      .then(
        Commands.literal('admin')
          .requires(function(src) { return src.hasPermission(2); })
          .executes(function(ctx) {
            var caller = ctx.source.player;
            if (caller && caller.tell) {
              caller.tell('§6§l── Gambit Stats Admin ──');
              caller.tell('§e/stats admin tracking on|off|status');
              caller.tell('§e/stats admin addwin <player|red|blue|all>');
              caller.tell('§e/stats admin reset all|<player>');
              caller.tell('§e/stats admin reset-session <player>');
            }
            return 1;
          })

          // /stats admin tracking on|off|status
          .then(
            Commands.literal('tracking')
              .then(
                Commands.literal('on')
                  .executes(function(ctx) {
                    statsTrackingEnabled = true;
                    _saveDevConfig();
                    ctx.source.server.runCommandSilent(
                      'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Stat tracking enabled.","color":"green"}]'
                    );
                    return 1;
                  })
              )
              .then(
                Commands.literal('off')
                  .executes(function(ctx) {
                    statsTrackingEnabled = false;
                    _saveDevConfig();
                    ctx.source.server.runCommandSilent(
                      'tellraw @a ["",{"text":"[Gambit] ","color":"gray"},{"text":"Stat tracking disabled.","color":"red"}]'
                    );
                    return 1;
                  })
              )
              .then(
                Commands.literal('status')
                  .executes(function(ctx) {
                    var caller = ctx.source.player;
                    if (caller && caller.tell) {
                      var state = (typeof statsTrackingEnabled !== 'undefined' && statsTrackingEnabled)
                        ? '§aENABLED' : '§cDISABLED';
                      caller.tell('§6[Gambit Stats] Tracking is currently: ' + state);
                    }
                    return 1;
                  })
              )
          )

          // /stats admin addwin <playerName|red|blue|all>
          .then(
            Commands.literal('addwin')
              .then(
                Commands.argument('playerName', StringArgumentType.word())
                  .suggests(suggestTeamTargets)
                  .executes(function(ctx) {
                    var target = StringArgumentType.getString(ctx, 'playerName');
                    var caller = ctx.source.player;
                    var result = applyMatchResult(ctx.source.server, target, false, true);
                    if (result.count <= 0) { if (caller && caller.tell) caller.tell('§c[Gambit Stats] No valid online target for addwin: "' + target + '".'); return 1; }
                    if (caller && caller.tell) {
                      if (result.mode === 'player') { caller.tell('§a[Gambit Stats] Added win for ' + result.playerName + '. Wins: ' + result.entry.wins + ', Matches: ' + result.entry.matches + ', W%: ' + getWinPct(result.entry).toFixed(1) + '%.'); }
                      else { caller.tell('§a[Gambit Stats] Added wins for ' + result.count + ' player(s) in target "' + result.mode + '".'); }
                    }
                    return 1;
                  })
              )
          )

          // /stats admin reset all / reset <playerName>
          .then(
            Commands.literal('reset')
              .then(
                Commands.literal('all')
                  .executes(function(ctx) {
                    var player    = ctx.source.player;
                    var actorName = player && player.name && player.name.string ? player.name.string : 'Server Console';
                    var count     = statsSize();
                    var keys      = Object.keys(stats);
                    for (var i = 0; i < keys.length; i++) stats[keys[i]] = makeDefaultEntry();
                    ctx.source.server.players.forEach(function(p) { clearEntryForPlayer(p); });
                    saveStatsToDisk();
                    gambitDbResetAll();
                    updateBillboard(ctx.source.server);
                    if (player && player.tell) player.tell('§a[Gambit Stats] Cleared stats for ' + count + ' player(s).');
                    ctx.source.server.players.forEach(function(p) {
                      if (!player || p.uuid !== player.uuid) p.tell('§a[Gambit Stats] Round stats have been reset by ' + actorName + '.');
                    });
                    return 1;
                  })
              )
              .then(
                Commands.argument('playerName', StringArgumentType.word())
                  .suggests(suggestPlayers)
                  .executes(function(ctx) {
                    var caller      = ctx.source.player;
                    var targetInput = StringArgumentType.getString(ctx, 'playerName');
                    var targetPlayer = getOnlinePlayerByName(ctx.source.server, targetInput);
                    if (targetPlayer) {
                      clearEntryForPlayer(targetPlayer);
                      saveStatsToDisk();
                      gambitDbResetPlayer(String(targetPlayer.uuid));
                      if (caller && caller.tell) {
                        caller.tell('§a[Gambit Stats] Reset stats for ' + targetPlayer.name.string + '.');
                        if (caller.uuid !== targetPlayer.uuid) targetPlayer.tell('§a[Gambit Stats] Your stats were reset by ' + caller.name.string + '.');
                      }
                      return 1;
                    }
                    var resolvedKey = getExistingStatName(targetInput);
                    if (!resolvedKey) { if (caller && caller.tell) caller.tell('§c[Gambit Stats] No stats found for "' + targetInput + '".'); return 1; }
                    var displayName = stats[resolvedKey] ? (stats[resolvedKey].name || resolvedKey) : resolvedKey;
                    stats[resolvedKey] = makeDefaultEntry();
                    stats[resolvedKey].name = displayName;
                    saveStatsToDisk();
                    gambitDbResetPlayer(resolvedKey);
                    if (caller && caller.tell) caller.tell('§a[Gambit Stats] Reset stats for ' + displayName + ' (offline).');
                    return 1;
                  })
              )
              .executes(function(ctx) {
                var caller = ctx.source.player;
                if (caller && caller.tell) caller.tell('§e[Gambit Stats] Specify a target: §f/stats admin reset all §eor §f/stats admin reset <playerName>');
                return 1;
              })
          )

          // /stats admin reset-session <playerName>
          .then(
            Commands.literal('reset-session')
              .then(
                Commands.argument('playerName', StringArgumentType.word())
                  .suggests(suggestPlayers)
                  .executes(function(ctx) {
                    var caller      = ctx.source.player;
                    var targetInput = StringArgumentType.getString(ctx, 'playerName');
                    var targetPlayer = getOnlinePlayerByName(ctx.source.server, targetInput);
                    if (targetPlayer) {
                      resetPlayerSession(targetPlayer.name.string);
                      saveStatsToDisk();
                      if (caller && caller.tell) {
                        caller.tell('§a[Gambit Stats] Reset session stats for ' + targetPlayer.name.string + '.');
                        if (caller.uuid !== targetPlayer.uuid) targetPlayer.tell('§a[Gambit Stats] Your session stats were reset by ' + caller.name.string + '.');
                      }
                      return 1;
                    }
                    var resolvedKey = getExistingStatName(targetInput);
                    if (!resolvedKey) { if (caller && caller.tell) caller.tell('§c[Gambit Stats] No stats found for "' + targetInput + '".'); return 1; }
                    resetPlayerSession(resolvedKey);
                    saveStatsToDisk();
                    if (caller && caller.tell) caller.tell('§a[Gambit Stats] Reset session stats for ' + (stats[resolvedKey] ? (stats[resolvedKey].name || resolvedKey) : resolvedKey) + ' (offline).');
                    return 1;
                  })
              )
          )
      )
  );

  // ── gambit_log_match ──────────────────────────────────────
  // Called from win/tie mcfunctions: gambit_log_match red|blue|tie
  event.register(
    Commands.literal('gambit_log_match')
      .requires(function(src) { return src.hasPermission(2); })
      .then(
        Commands.argument('winner', StringArgumentType.word())
          .executes(function(ctx) {
            var server = ctx.source.server;
            var winner = String(StringArgumentType.getString(ctx, 'winner')).toLowerCase();
            if (winner !== 'red' && winner !== 'blue' && winner !== 'tie') return 0;

            // Skip all stat recording when tracking is disabled.
            if (typeof statsTrackingEnabled !== 'undefined' && !statsTrackingEnabled) {
              // Clear staged analytics buffers so they don't leak into a later tracked match.
              if (typeof gambitGetPendingVoteRowsForMatch === 'function') gambitGetPendingVoteRowsForMatch();
              if (typeof gambitCollectKitUsageRowsForAnalytics === 'function') gambitCollectKitUsageRowsForAnalytics(server);
              return 1;
            }

            var modeId  = typeof currentModeId !== 'undefined' ? currentModeId : 0;
            var isTdm   = modeId === 1;
            var mvpResult = getRoundMvp();
            var mvpName   = mvpResult ? mvpResult.name : null;

            var playerDetails = [];
            if (server && server.players) {
              server.players.forEach(function(p) {
                var isRed  = hasTagSafe(p, 'Red');
                var isBlue = hasTagSafe(p, 'Blue');
                if (!isRed && !isBlue) return;
                var name = p.name && p.name.string ? p.name.string : null;
                if (!name) return;
                var rs       = roundStats[name] || { damage: 0, kills: 0, deaths: 0, assists: 0 };
                var isMvp    = (name === mvpName);
                var matchScore = isTdm ? calcTdmMatchScore(rs, isMvp) : calcElimMatchScore(rs, isMvp);
                var _uuid = null;
                try { if (p.uuid) _uuid = String(p.uuid); } catch (e) {}
                var _downs = 0;
                try {
                  var _downTag = (typeof PD_DOWNS !== 'undefined') ? PD_DOWNS : 'gambit_downs';
                  _downs = p.persistentData && p.persistentData.getInt ? Math.floor(Number(p.persistentData.getInt(_downTag) || 0)) : 0;
                } catch (e) {}
                var _revives = 0;
                var _longest = 0;
                // Accumulate per-mode score into lifetime stats
                loadEntryFromPlayer(p);
                var e = getEntry(name);
                if (isTdm) { e.tdm_score_total = (e.tdm_score_total || 0) + matchScore; e.tdm_matches = (e.tdm_matches || 0) + 1; }
                else       { e.elim_score_total = (e.elim_score_total || 0) + matchScore; e.elim_matches = (e.elim_matches || 0) + 1; }
                _revives = Math.floor(Number(e.revives || 0));
                _longest = Math.floor(Number(e.longest_streak || 0));
                playerDetails.push({
                  uuid: _uuid,
                  name: name,
                  team: isRed ? 'red' : 'blue',
                  kills: rs.kills || 0,
                  deaths: rs.deaths || 0,
                  damage: rs.damage || 0,
                  assists: rs.assists || 0,
                  match_score: matchScore,
                  is_mvp: isMvp,
                  revives: _revives,
                  downs: _downs,
                  longest_streak_match: _longest
                });
                saveEntryToPlayer(p);
              });
            }

            if (typeof gambitDbIsEnabled === 'function' && gambitDbIsEnabled()) {
              var mapId    = typeof currentMapId !== 'undefined' ? currentMapId : 0;
              var mapName  = 'Unknown';
              if (mapId > 0 && typeof getMapById === 'function') {
                var mapObj = getMapById(mapId);
                if (mapObj && mapObj.name) mapName = mapObj.name;
              }
              var modeName   = modeId === 1 ? 'tdm' : 'elimination';
              var durationSec = 0;
              if (typeof matchStartTime !== 'undefined' && matchStartTime > 0) {
                durationSec = Math.floor((Date.now() - matchStartTime) / 1000);
              }
              var dbMatchId = gambitDbInsertMatch(mapName, mapId, modeName, winner, durationSec);
              if (dbMatchId >= 0 && playerDetails.length > 0) gambitDbInsertMatchPlayers(dbMatchId, playerDetails);

              // New analytics schema writes (non-breaking, additive to legacy tables).
              if (typeof gambitDbInsertAnalyticsMatch === 'function') {
                var analyticsMatchId = gambitDbInsertAnalyticsMatch({
                  legacy_match_id: dbMatchId >= 0 ? dbMatchId : null,
                  map_id: mapId,
                  mode_id: modeId,
                  winner_team: winner,
                  started_at_ms: (typeof matchStartTime !== 'undefined' ? matchStartTime : null),
                  ended_at_ms: Date.now(),
                  duration_seconds: durationSec,
                  server_instance: 'default',
                  is_tournament: (typeof tournamentMode !== 'undefined' && tournamentMode) ? true : false
                });
                if (analyticsMatchId >= 0) {
                  if (typeof gambitDbInsertAnalyticsMatchPlayers === 'function' && playerDetails.length > 0) {
                    gambitDbInsertAnalyticsMatchPlayers(analyticsMatchId, playerDetails);
                  }
                  if (typeof gambitGetPendingVoteRowsForMatch === 'function' && typeof gambitDbInsertAnalyticsVotes === 'function') {
                    var voteRows = gambitGetPendingVoteRowsForMatch();
                    if (voteRows && voteRows.length > 0) gambitDbInsertAnalyticsVotes(analyticsMatchId, voteRows);
                  }
                  if (typeof gambitCollectKitUsageRowsForAnalytics === 'function' && typeof gambitDbInsertAnalyticsKitUsage === 'function') {
                    var kitRows = gambitCollectKitUsageRowsForAnalytics(server);
                    if (kitRows && kitRows.length > 0) gambitDbInsertAnalyticsKitUsage(analyticsMatchId, kitRows);
                  }
                }
              }

              if (dbMatchId >= 0) console.info('[Gambit Stats] Match #' + dbMatchId + ' logged: ' + mapName + ' ' + modeName + ' → ' + winner + ' (' + durationSec + 's, ' + playerDetails.length + ' players)');
            }

            markStatsDirty();
            return 1;
          })
      )
  );

  // ── /gambitboard ──────────────────────────────────────────
  // Lookup table avoids Rhino Java-backed Double issues with Math.sin/cos.
  // Yaw is always snapped to 45° increments before calling this.
  var QUAT_TABLE = {
    '0':   '0f,0f,0f,1f',
    '45':  '0f,-0.38268f,0f,0.92388f',
    '90':  '0f,-0.70711f,0f,0.70711f',
    '135': '0f,-0.92388f,0f,0.38268f',
    '180': '0f,-1f,0f,0f',
    '225': '0f,-0.92388f,0f,-0.38268f',
    '270': '0f,-0.70711f,0f,-0.70711f',
    '315': '0f,-0.38268f,0f,-0.92388f'
  };
  function yawToQuaternion(yawDeg) {
    if (typeof yawDeg !== 'number' || isNaN(yawDeg)) yawDeg = 0;
    var snapped = String((((Math.round(yawDeg / 45) * 45) % 360) + 360) % 360);
    return QUAT_TABLE[snapped] || '0f,0f,0f,1f';
  }

  function yawToCompass(yaw) {
    var dirs = ['S','SW','W','NW','N','NE','E','SE'];
    return dirs[((Math.round(((yaw % 360) + 360) % 360 / 45)) % 8)];
  }

  function setupBillboard(ctx, mode, yawDeg) {
    var player = ctx.source.player;
    if (!player || !player.tell) return 1;
    if (typeof yawDeg !== 'number' || isNaN(yawDeg)) {
      try {
        var _rawYaw = typeof player.getYRot === 'function' ? player.getYRot() : player.yRot;
        yawDeg = (((Math.round(parseFloat(_rawYaw) / 45) * 45) % 360) + 360) % 360;
      } catch(_yroe) {}
      if (typeof yawDeg !== 'number' || isNaN(yawDeg)) yawDeg = 0;
    }
    var playerName = player.name && player.name.string ? player.name.string : null;
    if (!playerName) return 1;
    var x = Math.floor(player.x);
    var y = Math.floor(player.y) + 1;
    var z = Math.floor(player.z);
    var tag = BILLBOARD_TAGS[mode];
    ctx.source.server.runCommandSilent('execute in minecraft:overworld run kill @e[type=minecraft:text_display,tag=' + tag + ']');
    billboardPositions[mode] = { x: x, y: y, z: z, yaw: yawDeg };
    saveBillboardPositions();
    var rotation = yawToQuaternion(yawDeg);
    var textJson = buildBillboardText(mode);
    var nbt = '{Tags:["' + tag + '"],billboard:"fixed",background:0,line_width:300,transformation:{left_rotation:[' + rotation + '],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[1f,1f,1f]},text:\'' + textJson + '\'}';
    player.tell('§7[dbg] yaw=' + yawDeg + ' rot=' + rotation);
    player.tell('§7[dbg] nbt[0..80]=' + nbt.substring(0, 80));
    ctx.source.server.runCommandSilent('execute as ' + playerName + ' in minecraft:overworld run summon minecraft:text_display ' + x + ' ' + y + ' ' + z + ' ' + nbt);
    ctx.source.server.runCommandSilent('execute in minecraft:overworld run forceload add ' + x + ' ' + z);
    player.tell('§a[Gambit Board] ' + mode + ' placed at ' + x + ' ' + y + ' ' + z + ' facing ' + yawToCompass(yawDeg) + ' (yaw=' + yawDeg + '). Stand ' + yawToCompass((yawDeg + 180) % 360) + ' of it to see the front.');
    return 1;
  }

  function removeBillboard(ctx, mode) {
    var player = ctx.source.player;
    if (!player || !player.tell) return 1;
    var tag    = BILLBOARD_TAGS[mode];
    var oldPos = billboardPositions[mode];
    billboardPositions[mode] = null;
    saveBillboardPositions();
    ctx.source.server.runCommandSilent('execute in minecraft:overworld run kill @e[type=minecraft:text_display,tag=' + tag + ']');
    if (oldPos) ctx.source.server.runCommandSilent('execute in minecraft:overworld run forceload remove ' + oldPos.x + ' ' + oldPos.z);
    player.tell('§a[Gambit Board] ' + mode.charAt(0).toUpperCase() + mode.slice(1) + ' billboard removed.');
    return 1;
  }

  event.register(
    Commands.literal('gambitboard')
      .requires(function(src) { return src.hasPermission(2); })
      .then(
        Commands.literal('setup')
          .then(Commands.literal('combined').executes(function(ctx) { return setupBillboard(ctx, 'combined', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'combined', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
          .then(Commands.literal('elim').executes(function(ctx) { return setupBillboard(ctx, 'elim', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'elim', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
          .then(Commands.literal('tdm').executes(function(ctx) { return setupBillboard(ctx, 'tdm', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'tdm', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
          .then(Commands.literal('combined_session').executes(function(ctx) { return setupBillboard(ctx, 'combined_session', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'combined_session', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
          .then(Commands.literal('elim_session').executes(function(ctx) { return setupBillboard(ctx, 'elim_session', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'elim_session', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
          .then(Commands.literal('tdm_session').executes(function(ctx) { return setupBillboard(ctx, 'tdm_session', null); }).then(Commands.argument('yaw', IntegerArgumentType.integer(0, 359)).executes(function(ctx) { return setupBillboard(ctx, 'tdm_session', parseInt(IntegerArgumentType.getInteger(ctx, 'yaw'), 10)); })))
      )
      .then(
        Commands.literal('remove')
          .executes(function(ctx) {
            var player = ctx.source.player;
            if (!player || !player.tell) return 1;
            for (var mi = 0; mi < ALL_BILLBOARD_MODES.length; mi++) {
              var _m = ALL_BILLBOARD_MODES[mi];
              var oldPos = billboardPositions[_m];
              billboardPositions[_m] = null;
              ctx.source.server.runCommandSilent('execute in minecraft:overworld run kill @e[type=minecraft:text_display,tag=' + BILLBOARD_TAGS[_m] + ']');
              if (oldPos) ctx.source.server.runCommandSilent('execute in minecraft:overworld run forceload remove ' + oldPos.x + ' ' + oldPos.z);
            }
            saveBillboardPositions();
            player.tell('§a[Gambit Board] All billboards removed.');
            return 1;
          })
          .then(Commands.literal('combined').executes(function(ctx) { return removeBillboard(ctx, 'combined'); }))
          .then(Commands.literal('elim').executes(function(ctx) { return removeBillboard(ctx, 'elim'); }))
          .then(Commands.literal('tdm').executes(function(ctx) { return removeBillboard(ctx, 'tdm'); }))
          .then(Commands.literal('combined_session').executes(function(ctx) { return removeBillboard(ctx, 'combined_session'); }))
          .then(Commands.literal('elim_session').executes(function(ctx) { return removeBillboard(ctx, 'elim_session'); }))
          .then(Commands.literal('tdm_session').executes(function(ctx) { return removeBillboard(ctx, 'tdm_session'); }))
      )
      .then(
        Commands.literal('refresh')
          .executes(function(ctx) {
            updateBillboard(ctx.source.server);
            if (ctx.source.player && ctx.source.player.tell) ctx.source.player.tell('§a[Gambit Board] All billboards updated.');
            return 1;
          })
      )
  );

  // ── gambit_reset_downs ────────────────────────────────────
  // Called from gun:starts/general at match start.
  // Resets each online player's persistent down counter and syncs the scoreboard.
  // Also clears all in-match tracking state for a clean round.
  event.register(
    Commands.literal('gambit_reset_downs')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        ctx.source.server.players.forEach(function(p) {
          var name = getPlayerName(p);
          if (!name) return;
          writeTagNumber(p.persistentData, PD_DOWNS, 0, true);
          ctx.source.server.runCommandSilent('scoreboard players set ' + name + ' gun_downs 0');
        });
        currentStreaks    = {};
        downerNames       = {};
        firstDownerNames  = {};
        executionKillerNames = {};
        syringeCounts     = {};
        recentlyDowned    = {};
        roundStats        = {};
        firstBloodDone    = false; // reset for new match
        return 1;
      })
  );

  // ── gambit_set_downs (debug) ──────────────────────────────
  // Usage: /gambit_set_downs <count>
  event.register(
    Commands.literal('gambit_set_downs')
      .requires(function(src) { return src.hasPermission(2); })
      .then(
        Commands.argument('count', IntegerArgumentType.integer(0, 10))
          .executes(function(ctx) {
            var player = ctx.source.player;
            if (!player) return 0;
            var count = IntegerArgumentType.getInteger(ctx, 'count');
            var name  = getPlayerName(player);
            writeTagNumber(player.persistentData, PD_DOWNS, count, true);
            ctx.source.server.runCommandSilent('scoreboard players set ' + name + ' gun_downs ' + count);
            player.tell('§a[Gambit Debug] Down count set to ' + count + ' (max: ' + downsConfig.max_downs + ').');
            return 1;
          })
      )
  );

  // ── gambit_wipe_match_logs (internal) ─────────────────────
  // Usage: /gambit_wipe_match_logs confirm
  // Deletes rows from gambit_match_players and gambit_match_history only.
  event.register(
    Commands.literal('gambit_wipe_match_logs')
      .requires(function(src) { return src.hasPermission(2); })
      .then(
        Commands.literal('confirm')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var tell = function(msg) { if (player && player.tell) player.tell(msg); else console.info(msg); };

            if (typeof gambitDbIsEnabled !== 'function' || !gambitDbIsEnabled()) {
              tell('§c[Gambit DB] DB is disabled.' );
              return 1;
            }
            if (!gambitDbIsConnected() && !gambitDbConnect()) {
              tell('§c[Gambit DB] Cannot connect — check server console.');
              return 1;
            }

            var result = gambitDbWipeMatchLogs();
            if (!result || !result.ok) {
              tell('§c[Gambit DB] Failed to wipe match logs: ' + (result && result.error ? result.error : 'unknown error'));
              return 1;
            }

            tell('§a[Gambit DB] Wiped match logs: gambit_match_players=' + result.deleted_match_players + ', gambit_match_history=' + result.deleted_match_history + '.');
            return 1;
          })
      )
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (player && player.tell) player.tell('§eUsage: §f/gambit_wipe_match_logs confirm');
        else console.info('[Gambit DB] Usage: /gambit_wipe_match_logs confirm');
        return 1;
      })
  );

  // ── /gambitfinisherdbg ────────────────────────────────────
  // Tests the finisher sword detection on the executing player's held item.
  event.register(
    Commands.literal('gambitfinisherdbg')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player) return 0;
        var tell = function(msg) { player.tell(msg); };
        tell('\u00a76\u00a7l\u2500\u2500 Finisher Debug \u2500\u2500');

        // 1. Main hand item
        var item = null;
        try { item = player.mainHandItem; } catch(e) { tell('\u00a7c mainHandItem threw: ' + e); return 1; }
        if (!item) { tell('\u00a7c mainHandItem is null'); return 1; }
        tell('\u00a77 itemId: \u00a7f' + String(item.id));
        tell('\u00a77 isEmpty: \u00a7f' + String(item.isEmpty ? item.isEmpty() : '?'));

        // 2. NBT via .nbt
        var nbt = null;
        try { nbt = item.nbt; } catch(e) { tell('\u00a7c item.nbt threw: ' + e); }
        tell('\u00a77 item.nbt: \u00a7f' + String(nbt));

        // 3. String indexOf check
        var nbtStr = String(nbt);
        tell('\u00a77 indexOf GambitFinisher: \u00a7f' + nbtStr.indexOf('GambitFinisher'));
        tell('\u00a77 hasFinisher: \u00a7f' + (nbtStr.indexOf('GambitFinisher') !== -1));

        // 4. recentlyDowned keys
        var rdKeys = [];
        try { rdKeys = Object.keys(recentlyDowned); } catch(e) {}
        tell('\u00a77 recentlyDowned: \u00a7f[' + rdKeys.join(', ') + ']');

        // 5. Tags on executor
        tell('\u00a77 hasTag Red: \u00a7f' + hasTagSafe(player, 'Red'));
        tell('\u00a77 hasTag Blue: \u00a7f' + hasTagSafe(player, 'Blue'));

        return 1;
      })
  );

  // ── /gambitdb ─────────────────────────────────────────────
  // Diagnostics for the MySQL connection.
  //   /gambitdb status    — print connection state + row counts
  //   /gambitdb reconnect — close and re-open the connection
  //   /gambitdb testlog   — insert a dummy match row, then delete it
  event.register(
    Commands.literal('gambitdb')
      .requires(function(src) { return src.hasPermission(2); })

      // /gambitdb status
      .then(
        Commands.literal('status')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var tell   = function(msg) { if (player && player.tell) player.tell(msg); else console.info(msg); };

            tell('§6§l── Gambit DB Status ──');

            if (typeof gambitDbIsEnabled !== 'function') {
              tell('§c gambit_db.js not loaded.');
              return 1;
            }

            tell('§7Driver loaded: ' + (_gambitDb.driverLoaded ? '§atrue' : '§cfalse'));
            tell('§7Enabled in config: ' + (_gambitDb.enabled ? '§atrue' : '§cfalse'));

            if (!gambitDbIsEnabled()) {
              tell('§cDB is disabled — check gambit_db_config.json and JDBC driver.');
              return 1;
            }

            var connected = gambitDbIsConnected();
            tell('§7Connection valid: ' + (connected ? '§atrue' : '§cfalse'));

            if (!connected) {
              tell('§eNot connected. Run §f/gambitdb reconnect§e to retry.');
              return 1;
            }

            // Row counts for all three tables
            var tables = ['gambit_match_history', 'gambit_match_players', 'gambit_player_stats'];
            for (var ti = 0; ti < tables.length; ti++) {
              try {
                var cStmt = _gambitDb.connection.createStatement();
                var cRs   = cStmt.executeQuery('SELECT COUNT(*) AS cnt FROM ' + tables[ti]);
                var cnt   = cRs.next() ? cRs.getLong('cnt') : -1;
                cRs.close(); cStmt.close();
                tell('§7' + tables[ti] + ': §f' + cnt + ' row(s)');
              } catch (e) {
                tell('§c' + tables[ti] + ': error — ' + e);
              }
            }

            tell('§6§l─────────────────────');
            return 1;
          })
      )

      // /gambitdb reconnect
      .then(
        Commands.literal('reconnect')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var tell   = function(msg) { if (player && player.tell) player.tell(msg); else console.info(msg); };

            if (typeof gambitDbIsEnabled !== 'function' || !gambitDbIsEnabled()) {
              tell('§c[Gambit DB] DB is disabled — check config/driver first.');
              return 1;
            }

            gambitDbDisconnect();
            var ok = gambitDbConnect();
            if (ok) {
              tell('§a[Gambit DB] Reconnected successfully.');
            } else {
              tell('§c[Gambit DB] Reconnect failed — check server console for details.');
            }
            return 1;
          })
      )

      // /gambitdb testlog
      // Inserts a clearly-labelled dummy match and immediately deletes it.
      // On success you'll see "Test insert OK, match_id=X" in chat and console.
      .then(
        Commands.literal('testlog')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var tell   = function(msg) { if (player && player.tell) player.tell(msg); else console.info(msg); };

            if (typeof gambitDbIsEnabled !== 'function' || !gambitDbIsEnabled()) {
              tell('§c[Gambit DB] DB is disabled.');
              return 1;
            }

            if (!gambitDbIsConnected() && !gambitDbConnect()) {
              tell('§c[Gambit DB] Cannot connect — check server console.');
              return 1;
            }

            // Insert a test row
            var testId = gambitDbInsertMatch('__db_test__', 0, 'test', 'red', 0);
            if (testId < 0) {
              tell('§c[Gambit DB] Test insert FAILED — check server console for the SQL error.');
              return 1;
            }

            // Immediately clean it up
            try {
              var delStmt = _gambitDb.connection.prepareStatement('DELETE FROM gambit_match_history WHERE match_id=?');
              delStmt.setInt(1, testId);
              delStmt.executeUpdate();
              delStmt.close();
              tell('§a[Gambit DB] Test insert OK (match_id=' + testId + ', cleaned up). DB writes are working.');
              console.info('[Gambit DB] testlog: insert + delete OK, match_id=' + testId);
            } catch (e) {
              tell('§e[Gambit DB] Insert succeeded (match_id=' + testId + ') but cleanup failed: ' + e);
            }
            return 1;
          })
      )

      // /gambitdb testdriver
      // Attempts Java.loadClass for both MySQL driver class names live and prints the actual exception.
      .then(
        Commands.literal('testdriver')
          .executes(function(ctx) {
            var player = ctx.source.player;
            var tell   = function(msg) { if (player && player.tell) player.tell(msg); else console.info(msg); };

            tell('§6§l── Gambit DB Driver Test ──');

            var classes = ['com.mysql.cj.jdbc.Driver', 'com.mysql.jdbc.Driver'];
            for (var ci = 0; ci < classes.length; ci++) {
              try {
                Java.loadClass(classes[ci]);
                tell('§a✔ ' + classes[ci] + ' loaded OK');
              } catch (e) {
                tell('§c✘ ' + classes[ci]);
                tell('§c  ' + e);
              }
            }

            tell('§6§l──────────────────────────');
            return 1;
          })
      )
  );

  // ── gambit_give_guide ─────────────────────────────────────
  // Called from gun:lobby/give_guide when a player lacks the field manual.
  // Player resolution: ctx.source.player is null when invoked via
  // "execute as @a ... run function", so fall back to a server player
  // lookup using the executing entity's username.
  event.register(
    Commands.literal('gambit_give_guide')
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player || !player.give) {
          try {
            var entity = ctx.source.entity;
            var ename = entity && (entity.username || (entity.name && entity.name.string));
            if (ename) player = getOnlinePlayerByName(ctx.source.server, ename);
          } catch(e) {}
        }
        if (!player || !player.give) return 1;
        _giveGuideBook(player);
        return 1;
      })
  );
});
