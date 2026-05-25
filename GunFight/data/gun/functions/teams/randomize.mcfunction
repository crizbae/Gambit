execute as @a[tag=Red] run function gun:teams/join_lobby
execute as @a[tag=Blue] run function gun:teams/join_lobby
function gun:teams/randomize/loop
tellraw @a[tag=Blue] ["You're on the ",{"text":"Blue Team!","color":"aqua"}]
tellraw @a[tag=Red] ["You're on the ",{"text":"Red Team!","color":"dark_red"}]
function gun:teams/repair
function gun:pleft/build
schedule function gun:pleft/loop 20t
