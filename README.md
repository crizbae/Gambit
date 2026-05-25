# Gambit

Gambit is a Minecraft PvP minigame system built with a datapack, KubeJS server scripts, and a MySQL-backed stats store. It adds structured team matches, map rotation, kit selection, post-game flow, player statistics, analytics, and tournament controls for small-format competitive play.

## Features

- Elimination and team deathmatch game modes
- Map registry with staged starts, spawn routing, spectator views, and post-match voting
- Red/Blue team assignment, queue controls, lobby flow, and spectator handling
- Kit selectors and per-kit loadouts
- Down/revive/finisher gameplay loop
- Player stats, leaderboards, match history, and in-world billboard support
- MySQL-backed persistence and analytics tables
- Tournament mode with manual rosters and participant-only match starts
- In-game field manual for player-facing commands and rules

## Repository Layout

```text
GunFight/
  pack.mcmeta
  data/gun/functions/       Minecraft function datapack logic
  data/minecraft/tags/      Function and damage-type tags

kubejs/
  server_scripts/           Gambit gameplay, commands, stats, maps, DB, and tournament scripts
  startup_scripts/          Startup-time KubeJS customization
  data/                     Gambit config and JSON data
```

## Requirements

- A Minecraft Java server compatible with datapack `pack_format` 15
- KubeJS installed on the server
- TACZ for the gun and weapon system used by Gambit loadouts
- PlayerRevive by CreativeMD for the revive-focused down system
- MySQL plus a MySQL JDBC connector JAR for persistent stats and analytics

## Core Mod Dependencies

Gambit is designed around a modded Minecraft server setup. The gunplay and weapon loadouts depend on the TACZ mod, which provides the firearm system the pack builds its kits and combat flow around.

The down and revive loop is based around PlayerRevive by CreativeMD. Gambit layers its own match logic, team rules, stats, and finisher behavior on top of that revive-focused gameplay foundation.

## Play Gambit

Gambit is hosted as a community event. If you are interested in playing, joining events, or following match announcements, join the Discord:

[Gambit Discord](https://discord.gg/sfP26qTjbv)

## Installation

1. Copy `GunFight` into your world's `datapacks` directory.
2. Copy the `kubejs` folder into the server root, alongside the server's existing `kubejs` directory structure.
3. Restart the server, or reload datapacks and KubeJS scripts if your environment supports it.
4. Confirm the datapack is enabled with `/datapack list`.

For stats and analytics, create `kubejs/data/gambit_db_config.json` on the server from `kubejs/data/gambit_db_config.example.json` with your MySQL connection settings and place `mysql-connector-j-*.jar` under `libraries/com/mysql/mysql-connector-j/<version>/`. Local JSON is treated as an emergency backup, not the primary stats architecture.

## Common Commands

Player commands:

- `/play` - join the next match
- `/sit` - sit out and spectate
- `/queue` - check queue status
- `/stats` - view stats help, leaderboards, sessions, and history

Operator commands:

- `/setmap <preset>` - stage a map
- `/start` - start the staged match
- `/gambitvote start|stop|enable|disable` - manage map voting
- `/tournament on|off|status|red|blue|remove|clear|swap` - manage tournament rosters
- `/gambitboard` - place or refresh leaderboard billboards
- `/gambitdb status|reconnect|testlog` - inspect database connectivity

## Development Notes

- Add or update playable maps in `kubejs/server_scripts/gambit_maps.js`.
- Add or update kits in `kubejs/data/gambit_kits.json`, then run `node scripts/generate_gambit_functions.js` to refresh generated selector, kit, range, lobby, and start functions.
- Use `node scripts/generate_gambit_functions.js --check` to verify generated datapack functions are current.
- Gameplay command registration is centralized in `kubejs/server_scripts/gambit_commands.js`.
- Stats, persistence, and analytics logic live in `kubejs/server_scripts/gambit_stats.js`, `gambit_tracker.js`, and `gambit_db.js`; MySQL is the core store for this layer.
- Datapack functions in `GunFight/data/gun/functions` coordinate the vanilla command-side match flow.
