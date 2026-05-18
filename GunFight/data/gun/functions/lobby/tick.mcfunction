# Lobby tick — effects, guide book, sumo handling
execute as @a[tag=gun_optout] run title @s actionbar [{"text":"Spectate Mode","color":"yellow","bold":true},{"text":" - use ","color":"gray"},{"text":"/play","color":"green"},{"text":" to queue","color":"gray"}]

# Kit display — show selected kit in actionbar for queued lobby players
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=assault] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Assault","color":"red","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=breacher] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Breacher","color":"gold","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=flanker] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Flanker","color":"aqua","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=marksman] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Marksman","color":"blue","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=sniper] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Sniper","color":"dark_purple","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=ranger] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Ranger","color":"green","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=burst] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Burst","color":"yellow","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=sentry] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Sentry","color":"light_purple","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=covert] run title @s actionbar [{"text":"Kit: ","color":"gray"},{"text":"Covert","color":"dark_gray","bold":true}]
execute as @a[team=lobby,tag=!gun_optout,gamemode=adventure,tag=!assault,tag=!breacher,tag=!flanker,tag=!marksman,tag=!sniper,tag=!ranger,tag=!burst,tag=!sentry,tag=!covert] run title @s actionbar {"text":"No kit selected — visit the armory","color":"gray","italic":true}

# Sumo tag: players standing on white or red wool in the sumo arena get the tag
execute as @a[x=-44,y=102,z=32,dx=13,dy=5,dz=13] at @s if block ~ ~-1 ~ minecraft:white_wool run tag @s add sumo
execute as @a[x=-44,y=102,z=32,dx=13,dy=5,dz=13] at @s if block ~ ~-1 ~ minecraft:red_wool run tag @s add sumo
# Reset grace timer while standing on wool
execute as @a[tag=sumo] at @s if block ~ ~-1 ~ minecraft:white_wool run scoreboard players set @s sumo_grace 0
execute as @a[tag=sumo] at @s if block ~ ~-1 ~ minecraft:red_wool run scoreboard players set @s sumo_grace 0
# Increment grace for tagged players not standing on wool (covers jumping, knockback, leaving arena)
execute as @a[tag=sumo] at @s unless block ~ ~-1 ~ minecraft:white_wool unless block ~ ~-1 ~ minecraft:red_wool run scoreboard players add @s sumo_grace 1
# Remove tag after 20 ticks (1 second) continuously off wool
execute as @a[tag=sumo,scores={sumo_grace=20..}] run tag @s remove sumo
# Sync sumo team from tag (team controls PvP via friendlyFire)
execute as @a[tag=sumo,team=!sumo] run team join sumo @s
execute as @a[tag=!sumo,team=sumo] run team join lobby @s

effect give @a[team=lobby] saturation 16 1 true
effect give @a[team=lobby] regeneration 5 1 true
tag @a[team=lobby] add gun_in_lobby
tag @a[team=!lobby] remove gun_in_lobby
execute as @a[team=lobby,gamemode=!creative,tag=!gun_optout] unless data entity @s Inventory[{id:"minecraft:written_book",tag:{title:"Gambit Field Manual"}}] run function gun:lobby/give_guide
effect give @a[team=sumo] saturation 16 1 true
effect give @a[team=sumo] regeneration 5 25 true