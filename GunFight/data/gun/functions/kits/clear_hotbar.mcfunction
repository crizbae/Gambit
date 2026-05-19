clear @s
execute if entity @s[tag=gun_in_match] run function gun:kits/armor_self
execute unless entity @s[tag=gun_in_match] if entity @s[team=red] run function gun:kits/armor_self
execute unless entity @s[tag=gun_in_match] if entity @s[team=blue] run function gun:kits/armor_self
execute unless entity @s[tag=gun_in_match] unless entity @s[team=red] unless entity @s[team=blue] run function gun:lobby/give_guide
execute unless entity @s[tag=gun_in_match] unless entity @s[team=red] unless entity @s[team=blue] run gambit_restore_vote_paper

