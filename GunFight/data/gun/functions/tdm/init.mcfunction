scoreboard objectives setdisplay sidebar
scoreboard objectives remove tdm_kills
scoreboard objectives add tdm_kills dummy {"text":"◄ TDM ►","color":"gold","bold":true}
scoreboard objectives modify tdm_kills displayname {"text":"◄ TDM ►","color":"gold","bold":true}
scoreboard players set #mode mode_id 1
scoreboard players set #mode mode_respawns 1
scoreboard players set #Red tdm_red_kills 0
scoreboard players set #Blue tdm_blue_kills 0
scoreboard players reset Final tdm_kills
scoreboard players reset Goal tdm_kills
scoreboard players reset Red tdm_kills
scoreboard players reset Blue tdm_kills
scoreboard players reset §fFinal tdm_kills
scoreboard players reset §eGoal tdm_kills
scoreboard players reset §cRed tdm_kills
scoreboard players reset §bBlue tdm_kills
scoreboard players set §cRed tdm_kills 0
scoreboard players set §bBlue tdm_kills 0
scoreboard players operation §eGoal tdm_kills = #target tdm_kill_target
execute store result bossbar gun:tdm_red max run scoreboard players get #target tdm_kill_target
bossbar set gun:tdm_red value 0
execute store result bossbar gun:tdm_blue max run scoreboard players get #target tdm_kill_target
bossbar set gun:tdm_blue value 0
scoreboard players set #RedWarn tdm_ui 0
scoreboard players set #BlueWarn tdm_ui 0
execute unless score #target tdm_kill_target matches 1.. run scoreboard players set #target tdm_kill_target 50
scoreboard players set @a tdm_respawn_timer 0
scoreboard players set @a spec_respawn_timer 0
schedule clear gun:tdm/spawnpoints
function gun:tdm/spawnpoints
tag @a remove gun_dead
tag @a remove gun_just_died
tag @a remove gun_spec_tp_pending
execute as @a[gamemode=!creative] run scoreboard players operation @s gun_deaths_prev = @s gun_deaths
execute as @a[gamemode=!creative] run scoreboard players operation @s tdm_deaths_counted = @s gun_deaths
