# Red/Blue tags are authoritative; scoreboard teams and lobby immunity mirror them.
execute as @a[tag=Red,tag=Blue] run function gun:teams/join_red
execute as @a[tag=Red,team=!red] run team join red @s
execute as @a[tag=Blue,team=!blue] run team join blue @s
tag @a[tag=Red] remove gun_in_lobby
tag @a[tag=Blue] remove gun_in_lobby
tag @a[tag=Red] remove sumo
tag @a[tag=Blue] remove sumo
scoreboard players set @a[tag=Red] sumo_grace 0
scoreboard players set @a[tag=Blue] sumo_grace 0
