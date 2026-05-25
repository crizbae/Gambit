execute as @r[gamemode=!creative,gamemode=!spectator,tag=!Red,tag=!Blue,tag=!gun_optout] run function gun:teams/join_blue
execute as @r[gamemode=!creative,gamemode=!spectator,tag=!Red,tag=!Blue,tag=!gun_optout] run function gun:teams/join_red
execute if entity @a[gamemode=!creative,gamemode=!spectator,tag=!Red,tag=!Blue,tag=!gun_optout] run function gun:teams/randomize/loop
