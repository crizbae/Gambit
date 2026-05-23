// ============================================================
// Gambit Utility Commands
//
//   /sit           - Opt out of queue immediately.
//                    If currently in a match, switch to spectator and teleport
//                    to the active map observer view. Otherwise stay adventure
//                    and spectate automatically at match start.
//                    Disabled while tournament mode is ON.
//
//   /play          - Opt back into queue for upcoming rounds.
//                    Does not force a gamemode change.
//                    Disabled while tournament mode is ON.
//
//   /queue         - Show current queue status.
//
//   /setgoal <n>   - Set the TDM kill target (OP only, 1–500).
//                    Broadcasts the new target to all players.
//
//   /devmode       - Undo event server restrictions for testing (OP only).
//                    Re-enables item drops, trapdoors, containers, entity frames, and debug info.
//
// Entity interaction protection:
//   Item frames (normal + glow) cannot be interacted with while
//   entityFrameLocked = true. Locked on server start and match start; unlocked by /devmode.
//
// Container/block protection:
//   Chests, trapped chests, barrels, shulker boxes, trapdoors, fence gates, and signs cannot be interacted
//   with while containerLocked = true. Locked on server start and match start; unlocked by /devmode.
//
//   /deathmatch    - Apply glowing to all living active players (OP only).
//
// Map commands (/setmap, /start) are in gambit_maps.js.
//
// Notes:
//   - Queue state is controlled by player tag: gun_optout
//   - Opted-out players are excluded from round-start team assignment.
// ============================================================

var OPT_OUT_TAG = 'gun_optout';
var IntegerArgumentType = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType');
var entityFrameLocked = true;
var containerLocked = true;
var deathmatchGlowEnabled = false;
var deathmatchGlowPulseTicker = 0;

function applyDeathmatchGlow(server) {
  if (!server) return;
  // Reapply to active alive participants so consumables that clear effects
  // (for example panacea pills) do not disable deathmatch visibility.
  server.runCommandSilent('effect give @a[tag=Red,tag=!gun_dead,gamemode=!spectator] minecraft:glowing 6 0 true');
  server.runCommandSilent('effect give @a[tag=Blue,tag=!gun_dead,gamemode=!spectator] minecraft:glowing 6 0 true');
}

BlockEvents.rightClicked(function (event) {
  var id = event.block.id;
  // Block bed interaction so players can't set spawn via beds used as decoration.
  // Skipped in dev mode (containerLocked = false) so builders can interact normally.
  if (containerLocked && id.indexOf('_bed') !== -1) {
    event.cancel();
    return;
  }
  if (!containerLocked) return;
  if (id === 'minecraft:chest'
      || id === 'minecraft:trapped_chest'
      || id === 'minecraft:barrel'
      || id.indexOf('shulker_box') !== -1
      || id === 'minecraft:anvil'
      || id === 'minecraft:chipped_anvil'
      || id === 'minecraft:damaged_anvil'
      || id.indexOf('trapdoor') !== -1
      || id.indexOf('fence_gate') !== -1
      || id.indexOf('sign') !== -1) {
    event.cancel();
  }
});

function runForPlayer(player, command) {
  if (!player || !player.server || !command) return;
  var name = player.name && player.name.string ? player.name.string : null;
  if (!name) return;
  player.server.runCommandSilent('execute as ' + name + ' run ' + command);
}

function setOptOutState(player, enabled) {
  if (!player) return false;

  if (enabled) {
    var wasInMatch = hasTagSafe(player, 'Red') || hasTagSafe(player, 'Blue');

    runForPlayer(player, 'tag @s add ' + OPT_OUT_TAG);
    runForPlayer(player, 'tag @s remove Red');
    runForPlayer(player, 'tag @s remove Blue');
    runForPlayer(player, 'team join lobby @s');
    runForPlayer(player, 'clear @s');
    if (wasInMatch) {
      runForPlayer(player, 'gamemode spectator');
      runForPlayer(player, 'function gun:starts/spectator_tpmap');
    } else {
      runForPlayer(player, 'gamemode adventure');
    }
    runForPlayer(player, 'tag @s remove gun_dead');
    runForPlayer(player, 'tag @s remove gun_just_died');
    runForPlayer(player, 'tag @s remove gun_spec_tp_pending');
    runForPlayer(player, 'scoreboard players set @s tdm_respawn_timer 0');
    runForPlayer(player, 'scoreboard players set @s spec_respawn_timer 0');
    return true;
  }

  runForPlayer(player, 'tag @s remove ' + OPT_OUT_TAG);
  runForPlayer(player, 'team join lobby @s');
  runForPlayer(player, 'scoreboard players set @s tdm_respawn_timer 0');
  runForPlayer(player, 'scoreboard players set @s spec_respawn_timer 0');
  return true;
}

function tellQueueStatus(player) {
  var optedOut = hasTagSafe(player, OPT_OUT_TAG);
  if (optedOut) {
    player.tell('§e[Gambit Queue] Spectate mode is enabled. You will not be placed in matches.');
    player.tell('§7Use §f/play §7to opt back in.');
    return;
  }

  player.tell('§a[Gambit Queue] You are in the match queue.');
  player.tell('§7Use §f/sit §7to opt out.');
}

ServerEvents.loaded(function(event) {
  event.server.runCommandSilent('scoreboard objectives add nextmap_id dummy');
  event.server.runCommandSilent('scoreboard objectives add nextmap_mode dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_kill_target dummy "Kill Target"');
  event.server.runCommandSilent('execute unless score #target tdm_kill_target matches 1.. run scoreboard players set #target tdm_kill_target 50');
  event.server.runCommandSilent('bossbar add gun:nextmap {"text":""}');
  event.server.runCommandSilent('bossbar set gun:nextmap visible false');
  event.server.runCommandSilent('bossbar set gun:nextmap max 1');
  event.server.runCommandSilent('bossbar set gun:nextmap value 1');
  event.server.runCommandSilent('bossbar add gun:tdm_red {"text":""}');
  event.server.runCommandSilent('bossbar set gun:tdm_red color red');
  event.server.runCommandSilent('bossbar set gun:tdm_red visible false');
  event.server.runCommandSilent('bossbar add gun:tdm_blue {"text":""}');
  event.server.runCommandSilent('bossbar set gun:tdm_blue color blue');
  event.server.runCommandSilent('bossbar set gun:tdm_blue visible false');
  event.server.runCommandSilent('bossbar add gun:elim_red {"text":""}');
  event.server.runCommandSilent('bossbar set gun:elim_red color red');
  event.server.runCommandSilent('bossbar set gun:elim_red visible false');
  event.server.runCommandSilent('bossbar add gun:elim_blue {"text":""}');
  event.server.runCommandSilent('bossbar set gun:elim_blue color blue');
  event.server.runCommandSilent('bossbar set gun:elim_blue visible false');

  // Match scoreboards — created once at server load, reset between matches
  event.server.runCommandSilent('scoreboard objectives add rcount dummy');
  event.server.runCommandSilent('scoreboard objectives add bcount dummy');
  event.server.runCommandSilent('scoreboard objectives add teams dummy "Players Left"');
  event.server.runCommandSilent('scoreboard objectives add mode_id dummy');
  event.server.runCommandSilent('scoreboard objectives add mode_respawns dummy');
  event.server.runCommandSilent('scoreboard objectives add map_id dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_red_kills dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_blue_kills dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_respawn_timer dummy');
  event.server.runCommandSilent('scoreboard objectives add spec_respawn_timer dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_kills dummy {"text":"◄ TDM ►","color":"gold","bold":true}');
  event.server.runCommandSilent('scoreboard objectives modify tdm_kills displayname {"text":"◄ TDM ►","color":"gold","bold":true}');
  event.server.runCommandSilent('scoreboard objectives add tdm_deaths_counted dummy');
  event.server.runCommandSilent('scoreboard objectives add gun_deaths deathCount');
  event.server.runCommandSilent('scoreboard objectives add gun_deaths_prev dummy');
  event.server.runCommandSilent('scoreboard objectives add gun_downs dummy');

  event.server.runCommandSilent('scoreboard objectives add ration_roll dummy');
  event.server.runCommandSilent('scoreboard objectives add pleft_ui_timer dummy');
  event.server.runCommandSilent('scoreboard objectives add tdm_ui dummy');
  event.server.runCommandSilent('scoreboard objectives add life_kills dummy');
  event.server.runCommandSilent('scoreboard objectives add life_dmg dummy');
  event.server.runCommandSilent('scoreboard objectives add pleft_sidebar dummy "Players Left"');
  event.server.runCommandSilent('scoreboard objectives add sumo_grace dummy');

  // Ensure teams exist and lobby loop is running
  event.server.runCommandSilent('function gun:teams/build');
  event.server.runCommandSilent('schedule function gun:selectors/loop 1t');

  // Persistent event server settings — applied at load so they're active from the start
  event.server.runCommandSilent('yawp global add flag item-drop Denied');
  event.server.runCommandSilent('gamerule keepInventory true');
  event.server.runCommandSilent('gamerule reducedDebugInfo true');
  event.server.runCommandSilent('gamerule showDeathMessages false');
  event.server.runCommandSilent('gamerule announceAdvancements false');
  event.server.runCommandSilent('gamerule doDaylightCycle false');
  event.server.runCommandSilent('time set 13200');
  event.server.runCommandSilent('gamerule doWeatherCycle false');
  event.server.runCommandSilent('weather clear');
});

// ── Entity interaction protection ─────────────────────────────
// Prevent players from rotating/removing items from item frames while
// a match is active. Mirrors the trapdoor system.
ItemEvents.entityInteracted(function(event) {
  if (!entityFrameLocked) return;
  var type = '';
  try { type = String(event.entity.type); } catch (e) {}
  if (type === 'minecraft:item_frame'
      || type === 'minecraft:glow_item_frame') {
    event.cancel();
  }
});

ServerEvents.tick(function(event) {
  deathmatchGlowPulseTicker += 1;
  if (deathmatchGlowPulseTicker < 20) return;
  deathmatchGlowPulseTicker = 0;

  if (!deathmatchGlowEnabled) return;
  applyDeathmatchGlow(event.server);
});

ServerEvents.commandRegistry(function(event) {
  var Commands = event.commands;

  // Gambit's queue opt-out command.
  event.register(
    Commands.literal('sit')
      .requires(function(src) { return src.hasPermission(0); })
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player || !player.tell) return 1;

        if (typeof tournamentMode !== 'undefined' && tournamentMode) {
          player.tell('§c[Tournament] /sit is disabled while tournament mode is ON.');
          return 0;
        }

        if (hasTagSafe(player, OPT_OUT_TAG)) {
          player.tell('§e[Gambit Queue] Spectate mode is already enabled.');
          return 1;
        }

        setOptOutState(player, true);
        player.tell('§e[Gambit Queue] Spectate mode enabled. Use §f/play §eto rejoin the queue.');

        // If a match is active, TP to the map spectator viewpoint.
        if (typeof currentMapId !== 'undefined' && currentMapId !== 0) {
          var _specMap = typeof getMapById === 'function' ? getMapById(currentMapId) : null;
          if (_specMap && _specMap.spectator) {
            var _specName = player.name && player.name.string ? player.name.string : null;
            if (_specName) {
              var _specServer = ctx.source.server;
              _specServer.runCommandSilent('gamemode spectator ' + _specName);
              _specServer.runCommandSilent('execute in minecraft:overworld run tp ' + _specName + ' ' + _specMap.spectator);
            }
          }
        }
        return 1;
      })
  );

  event.register(
    Commands.literal('play')
      .requires(function(src) { return src.hasPermission(0); })
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player || !player.tell) return 1;

        if (typeof tournamentMode !== 'undefined' && tournamentMode) {
          player.tell('§c[Tournament] /play is disabled while tournament mode is ON.');
          return 0;
        }

        if (!hasTagSafe(player, OPT_OUT_TAG)) {
          player.tell('§e[Gambit Queue] You are already in the queue.');
          return 1;
        }

        setOptOutState(player, false);
        player.tell('§a[Gambit Queue] You are queued to play in the next match.');
        return 1;
      })
  );

  event.register(
    Commands.literal('queue')
      .executes(function(ctx) {
        var player = ctx.source.player;
        if (!player || !player.tell) return 1;
        tellQueueStatus(player);
        return 1;
      })
  );

  event.register(
    Commands.literal('setgoal')
      .requires(function(src) { return src.hasPermission(2); })
      .then(
        Commands.argument('kills', IntegerArgumentType.integer(1, 500))
          .executes(function(ctx) {
            var kills = IntegerArgumentType.getInteger(ctx, 'kills');
            ctx.source.server.runCommandSilent('scoreboard objectives add tdm_kill_target dummy "Kill Target"');
            ctx.source.server.runCommandSilent('scoreboard players set #target tdm_kill_target ' + kills);
            ctx.source.server.runCommandSilent(
              'tellraw @a ["[Gambit] ",{"text":"TDM kill target set to ","color":"yellow"},{"text":"' + kills + '","color":"aqua"},{"text":" kills.","color":"yellow"}]'
            );
            return 1;
          })
      )
  );

  event.register(
    Commands.literal('lockserver')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        entityFrameLocked = true;
        containerLocked = true;
        return 1;
      })
  );

  event.register(
    Commands.literal('devmode')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var server = ctx.source.server;
        entityFrameLocked = false;
        containerLocked = false;
        try { server.runCommandSilent('yawp global remove flag item-drop'); } catch (e) {}
        server.runCommandSilent('gamerule reducedDebugInfo false');
        if (ctx.source.player) {
          ctx.source.player.tell('§6[Gambit Dev] §eItem-drop enabled, trapdoors/containers unlocked, debug info visible.');
        }
        return 1;
      })
  );

  event.register(
    Commands.literal('deathmatch')
      .requires(function(src) { return src.hasPermission(2); })
      .executes(function(ctx) {
        var server = ctx.source.server;
        deathmatchGlowEnabled = true;
        applyDeathmatchGlow(server);
        server.runCommandSilent(
          'tellraw @a ["",{"text":"[Gambit] ","color":"gold","bold":true},{"text":"DEATHMATCH — all players are now visible!","color":"red","bold":true}]'
        );
        return 1;
      })
      .then(
        Commands.literal('on')
          .executes(function(ctx) {
            deathmatchGlowEnabled = true;
            applyDeathmatchGlow(ctx.source.server);
            ctx.source.server.runCommandSilent(
              'tellraw @a ["",{"text":"[Gambit] ","color":"gold","bold":true},{"text":"DEATHMATCH glow ON.","color":"red","bold":true}]'
            );
            return 1;
          })
      )
      .then(
        Commands.literal('off')
          .executes(function(ctx) {
            deathmatchGlowEnabled = false;
            ctx.source.server.runCommandSilent('effect clear @a[tag=Red] minecraft:glowing');
            ctx.source.server.runCommandSilent('effect clear @a[tag=Blue] minecraft:glowing');
            ctx.source.server.runCommandSilent(
              'tellraw @a ["",{"text":"[Gambit] ","color":"gold","bold":true},{"text":"DEATHMATCH glow OFF.","color":"yellow","bold":true}]'
            );
            return 1;
          })
      )
      .then(
        Commands.literal('status')
          .executes(function(ctx) {
            var player = ctx.source.player;
            if (player && player.tell) {
              player.tell('§6[Gambit] §eDeathmatch glow: ' + (deathmatchGlowEnabled ? '§aON' : '§cOFF'));
            }
            return 1;
          })
      )
  );
});
