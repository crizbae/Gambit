// ============================================================
// Gambit Team Balancer
//
// Builds balanced Red/Blue teams from queued players using existing Gambit
// stats. Tournament mode still uses manual rosters.
// ============================================================

var GAMBIT_BALANCE_CONFIG_PATH = 'kubejs/data/gambit_dev_config.json';
var GAMBIT_BALANCE_MAX_BRUTE_FORCE = 18;

function _gambitClamp(n, min, max) {
  n = Number(n);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function _gambitReadBalanceNextHighestRed() {
  try {
    var cfg = JsonIO.read(GAMBIT_BALANCE_CONFIG_PATH);
    if (cfg && typeof cfg.balance_next_highest_red !== 'undefined') return !!cfg.balance_next_highest_red;
  } catch (_e) {}
  return (Math.floor(Date.now() / 1000) % 2) === 0;
}

function _gambitWriteBalanceNextHighestRed(value) {
  try {
    var cfg = {};
    try { cfg = JsonIO.read(GAMBIT_BALANCE_CONFIG_PATH) || {}; } catch (_re) {}
    cfg.balance_next_highest_red = !!value;
    JsonIO.write(GAMBIT_BALANCE_CONFIG_PATH, cfg);
  } catch (e) {
    console.error('[Gambit Balance] Failed to save balance side toggle: ' + e);
  }
}

function gambitGetPlayerBalanceRating(player, modeId) {
  if (!player) return { rating: 1000, confidence: 0, label: 'provisional' };
  try {
    if (typeof loadEntryFromPlayer === 'function') loadEntryFromPlayer(player);
  } catch (_loadErr) {}

  var uuid = null;
  try { uuid = String(player.uuid); } catch (_uuidErr) {}
  var name = getPlayerName(player);
  var e = null;
  try {
    if (uuid && typeof getEntry === 'function') e = getEntry(uuid);
    else if (name && typeof getEntry === 'function') e = getEntry(name);
  } catch (_entryErr) {}
  if (!e) e = {};

  var matches = Math.max(0, Math.floor(Number(e.matches || 0)));
  var modeMatches = modeId === 1 ? Math.floor(Number(e.tdm_matches || 0)) : Math.floor(Number(e.elim_matches || 0));
  var combinedModeMatches = Math.floor(Number(e.tdm_matches || 0)) + Math.floor(Number(e.elim_matches || 0));

  var kills = Math.max(0, Number(e.kills || 0));
  var deaths = Math.max(0, Number(e.deaths || 0));
  var damage = Math.max(0, Number(e.damage || 0));
  var assists = Math.max(0, Number(e.assists || 0));
  var revives = Math.max(0, Number(e.revives || 0));
  var mvps = Math.max(0, Number(e.mvps || 0));
  var wins = Math.max(0, Number(e.wins || 0));
  var longestStreak = Math.max(0, Number(e.longest_streak || 0));

  var modeKills = modeId === 1 ? Number(e.tdm_kills || 0) : Number(e.elim_kills || 0);
  var modeDeaths = modeId === 1 ? Number(e.tdm_deaths || 0) : Number(e.elim_deaths || 0);
  var modeAvgScore = 0;
  try {
    if (modeId === 1 && typeof getTdmAvgScore === 'function') modeAvgScore = getTdmAvgScore(e);
    else if (modeId !== 1 && typeof getElimAvgScore === 'function') modeAvgScore = getElimAvgScore(e);
  } catch (_modeScoreErr) {}
  var combinedAvgScore = 0;
  try { if (typeof getCombinedAvgScore === 'function') combinedAvgScore = getCombinedAvgScore(e); } catch (_combinedScoreErr) {}

  var kd = (modeKills > 0 || modeDeaths > 0)
    ? (modeKills / Math.max(1, modeDeaths))
    : (kills / Math.max(1, deaths));
  kd = _gambitClamp(kd, 0, 4);

  var winRate = matches > 0 ? (wins / Math.max(1, matches)) : 0.5;
  winRate = _gambitClamp(winRate, 0.15, 0.85);

  var kpm = kills / Math.max(1, matches);
  var dpl = damage / Math.max(1, deaths);
  var assistRate = assists / Math.max(1, matches);
  var reviveRate = revives / Math.max(1, matches);
  var mvpRate = mvps / Math.max(1, matches);

  var session = e.session || null;
  var sessionMatches = session ? Math.max(0, Number(session.matches || 0)) : 0;
  var sessionKd = 1;
  var sessionKpm = 0;
  if (session && sessionMatches > 0) {
    sessionKd = _gambitClamp(Number(session.kills || 0) / Math.max(1, Number(session.deaths || 0)), 0, 4);
    sessionKpm = Number(session.kills || 0) / Math.max(1, sessionMatches);
  }

  var scoreBasis = modeMatches >= 3 ? modeAvgScore : combinedAvgScore;
  scoreBasis = _gambitClamp(scoreBasis, -250, 900);

  var rating =
    1000
    + (scoreBasis * 0.22)
    + ((_gambitClamp(kpm, 0, 6) - 1.0) * 85)
    + ((_gambitClamp(dpl, 0, 550) - 120) * 0.35)
    + ((kd - 1.0) * 120)
    + ((winRate - 0.5) * 170)
    + (_gambitClamp(assistRate, 0, 4) * 35)
    + (_gambitClamp(reviveRate, 0, 3) * 45)
    + (_gambitClamp(mvpRate, 0, 0.5) * 130)
    + (_gambitClamp(longestStreak, 0, 20) * 5);

  if (sessionMatches > 0) {
    rating += ((sessionKd - 1.0) * 35) + (_gambitClamp(sessionKpm, 0, 6) * 18);
  }

  var confidence = _gambitClamp(Math.max(matches, combinedModeMatches) / 12, 0, 1);
  rating = (1000 * (1 - confidence)) + (rating * confidence);
  rating = Math.round(_gambitClamp(rating, 650, 1850));

  var label = confidence < 0.35 ? 'provisional' : (confidence < 0.75 ? 'developing' : 'established');
  return { rating: rating, confidence: confidence, label: label };
}

function _gambitCollectBalancePlayers(server, modeId) {
  var players = [];
  if (!server || !server.players) return players;
  server.players.forEach(function(player) {
    if (!player) return;
    try { if (player.isCreative() || player.isSpectator()) return; } catch (_gmErr) {}
    if (hasTagSafe(player, 'gun_optout')) return;

    var name = getPlayerName(player);
    if (!name) return;
    var rating = gambitGetPlayerBalanceRating(player, modeId);
    players.push({
      player: player,
      name: name,
      rating: rating.rating,
      confidence: rating.confidence,
      label: rating.label
    });
  });
  return players;
}

function _gambitFindBestSplit(players) {
  var n = players.length;
  var targetSize = Math.ceil(n / 2);
  var total = 0;
  for (var i = 0; i < n; i++) total += players[i].rating;

  var best = null;
  function consider(indices) {
    var sum = 0;
    var indexSet = {};
    for (var ii = 0; ii < indices.length; ii++) {
      sum += players[indices[ii]].rating;
      indexSet[indices[ii]] = true;
    }
    var diff = Math.abs(sum - (total - sum));
    var confidencePenalty = 0;
    for (var pi = 0; pi < players.length; pi++) {
      var lowConfidence = 1 - players[pi].confidence;
      confidencePenalty += lowConfidence * (indexSet[pi] ? 1 : -1);
    }
    var score = diff + Math.abs(confidencePenalty) * 3;
    if (!best || score < best.score) best = { indices: indices.slice(0), sum: sum, score: score };
  }

  var choose = function(start, chosen) {
    if (chosen.length === targetSize) {
      consider(chosen);
      return;
    }
    var remainingNeeded = targetSize - chosen.length;
    for (var idx = start; idx <= n - remainingNeeded; idx++) {
      chosen.push(idx);
      choose(idx + 1, chosen);
      chosen.pop();
    }
  };

  if (n <= GAMBIT_BALANCE_MAX_BRUTE_FORCE) {
    choose(0, []);
  } else {
    var teamA = [];
    var sumA = 0;
    var sumB = 0;
    for (var gi = 0; gi < n; gi++) {
      var canA = teamA.length < targetSize;
      var slotsLeft = n - gi;
      var mustA = targetSize - teamA.length >= slotsLeft;
      if (mustA || (canA && sumA <= sumB)) {
        teamA.push(gi);
        sumA += players[gi].rating;
      } else {
        sumB += players[gi].rating;
      }
    }
    consider(teamA);
  }

  var aSet = {};
  for (var bi = 0; bi < best.indices.length; bi++) aSet[best.indices[bi]] = true;
  var out = { a: [], b: [] };
  for (var oi = 0; oi < n; oi++) {
    if (aSet[oi]) out.a.push(players[oi]);
    else out.b.push(players[oi]);
  }
  return out;
}

function _gambitTeamRating(team) {
  var sum = 0;
  for (var i = 0; i < team.length; i++) sum += team[i].rating;
  return sum;
}

function _gambitAssignBalancedTeam(server, entry, color) {
  if (!server || !entry || !entry.name) return;
  server.runCommandSilent('execute as ' + entry.name + ' run function gun:teams/join_' + color);
}

function gambitBalanceTeams(server, modeId) {
  var players = _gambitCollectBalancePlayers(server, modeId);
  if (players.length === 0) {
    console.info('[Gambit Balance] No queued players found.');
    return false;
  }

  players.sort(function(a, b) {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return String(a.name).localeCompare(String(b.name));
  });

  server.runCommandSilent('execute as @a[tag=Red] run function gun:teams/join_lobby');
  server.runCommandSilent('execute as @a[tag=Blue] run function gun:teams/join_lobby');

  var split = _gambitFindBestSplit(players);
  var highest = players[0];
  var highestInA = false;
  for (var hi = 0; hi < split.a.length; hi++) {
    if (split.a[hi].name === highest.name) { highestInA = true; break; }
  }

  var nextHighestRed = _gambitReadBalanceNextHighestRed();
  var redTeam = (highestInA === nextHighestRed) ? split.a : split.b;
  var blueTeam = (redTeam === split.a) ? split.b : split.a;
  _gambitWriteBalanceNextHighestRed(!nextHighestRed);

  for (var ri = 0; ri < redTeam.length; ri++) _gambitAssignBalancedTeam(server, redTeam[ri], 'red');
  for (var bi = 0; bi < blueTeam.length; bi++) _gambitAssignBalancedTeam(server, blueTeam[bi], 'blue');

  server.runCommandSilent('function gun:teams/repair');
  server.runCommandSilent('function gun:pleft/build');
  server.runCommandSilent('schedule function gun:pleft/loop 20t');

  var redRating = _gambitTeamRating(redTeam);
  var blueRating = _gambitTeamRating(blueTeam);
  var redAvg = redTeam.length > 0 ? Math.round(redRating / redTeam.length) : 0;
  var blueAvg = blueTeam.length > 0 ? Math.round(blueRating / blueTeam.length) : 0;
  var diff = Math.abs(redRating - blueRating);

  server.runCommandSilent('tellraw @a[tag=Red] ["You are on the ",{"text":"Red Team!","color":"dark_red"}]');
  server.runCommandSilent('tellraw @a[tag=Blue] ["You are on the ",{"text":"Blue Team!","color":"aqua"}]');
  console.info('[Gambit Balance] Teams balanced by player rating. Red avg ' + redAvg + ' vs Blue avg ' + blueAvg + ' (diff ' + Math.round(diff) + ').');
  return true;
}

function gambitPreviewBalancedTeams(server, viewer, modeId) {
  if (!viewer || !viewer.tell) return 0;
  var players = _gambitCollectBalancePlayers(server, modeId);
  if (players.length === 0) {
    viewer.tell('§c[Gambit Balance] No queued players found.');
    return 0;
  }
  players.sort(function(a, b) {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return String(a.name).localeCompare(String(b.name));
  });
  var split = _gambitFindBestSplit(players);
  var highest = players[0];
  var highestInA = false;
  for (var hi = 0; hi < split.a.length; hi++) {
    if (split.a[hi].name === highest.name) { highestInA = true; break; }
  }
  var nextHighestRed = _gambitReadBalanceNextHighestRed();
  var redTeam = (highestInA === nextHighestRed) ? split.a : split.b;
  var blueTeam = (redTeam === split.a) ? split.b : split.a;
  var redRating = _gambitTeamRating(redTeam);
  var blueRating = _gambitTeamRating(blueTeam);

  function teamLine(team) {
    if (team.length === 0) return 'none';
    var parts = [];
    for (var i = 0; i < team.length; i++) {
      parts.push(team[i].name + ' (' + team[i].rating + (team[i].label === 'provisional' ? 'p' : '') + ')');
    }
    return parts.join(', ');
  }

  viewer.tell('§6§l── Gambit Balance Preview ──');
  viewer.tell('§7Mode: §f' + (modeId === 1 ? 'TDM' : 'Elimination') + ' §8| §7Players: §f' + players.length);
  viewer.tell('§cRed §7avg §f' + (redTeam.length ? Math.round(redRating / redTeam.length) : 0) + '§7: §f' + teamLine(redTeam));
  viewer.tell('§bBlue §7avg §f' + (blueTeam.length ? Math.round(blueRating / blueTeam.length) : 0) + '§7: §f' + teamLine(blueTeam));
  viewer.tell('§7Total rating diff: §f' + Math.round(Math.abs(redRating - blueRating)) + ' §8| §7p = provisional rating');
  return 1;
}

ServerEvents.commandRegistry(function(event) {
  var Commands = event.commands;
  event.register(
    Commands.literal('gambit_balance_teams')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var mode = 0;
        try {
          if (typeof currentModeId !== 'undefined') mode = currentModeId;
          if (typeof stagedModeId !== 'undefined' && stagedModeId === 1) mode = 1;
        } catch (_modeErr) {}
        return gambitBalanceTeams(ctx.source.server, mode) ? 1 : 0;
      })
  );

  event.register(
    Commands.literal('gambitbalance')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (player && player.tell) {
          player.tell('§6[Gambit Balance] §e/gambitbalance preview');
        }
        return 1;
      })
      .then(
        Commands.literal('preview')
          .executes(function(ctx) {
            var mode = 0;
            try {
              if (typeof stagedModeId !== 'undefined') mode = stagedModeId;
              else if (typeof currentModeId !== 'undefined') mode = currentModeId;
            } catch (_modeErr) {}
            return gambitPreviewBalancedTeams(ctx.source.server, ctx.source.player, mode);
          })
      )
  );
});
