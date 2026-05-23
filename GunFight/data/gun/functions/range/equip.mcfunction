# Equip the player's currently selected kit for shooting range use.
# Called on range entry (if kit already selected) and on kit pad selection while in range.
clear @s
execute if entity @s[tag=assault] run function gun:kits/single/assault
execute if entity @s[tag=breacher] run function gun:kits/single/breacher
execute if entity @s[tag=burst] run function gun:kits/single/burst
execute if entity @s[tag=covert] run function gun:kits/single/covert
execute if entity @s[tag=flanker] run function gun:kits/single/flanker
execute if entity @s[tag=gunslinger] run function gun:kits/single/gunslinger
execute if entity @s[tag=marksman] run function gun:kits/single/marksman
execute if entity @s[tag=ranger] run function gun:kits/single/ranger
execute if entity @s[tag=sentry] run function gun:kits/single/sentry
execute if entity @s[tag=sniper] run function gun:kits/single/sniper
item replace entity @s inventory.25 with tacz:ammo_box{AllTypeCreative:1b}
tag @s add range_kitted
