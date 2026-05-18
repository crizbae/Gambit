# Kit selector tick - detect players standing on kit selection blocks
# Lobby selection is always available for lobby players.
execute as @a[team=lobby,tag=!marksman,gamemode=adventure] at @s if block ~ ~-1 ~ blue_stained_glass if block ~ ~-2 ~ sea_lantern if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/marksman
execute as @a[team=lobby,tag=!breacher,gamemode=adventure] at @s if block ~ ~-1 ~ orange_stained_glass if block ~ ~-2 ~ honeycomb_block if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/breacher
execute as @a[team=lobby,tag=!flanker,gamemode=adventure] at @s if block ~ ~-1 ~ light_blue_stained_glass if block ~ ~-2 ~ prismarine if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/flanker
execute as @a[team=lobby,tag=!assault,gamemode=adventure] at @s if block ~ ~-1 ~ red_stained_glass if block ~ ~-2 ~ shroomlight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/assault
execute as @a[team=lobby,tag=!sniper,gamemode=adventure] at @s if block ~ ~-1 ~ purple_stained_glass if block ~ ~-2 ~ pearlescent_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sniper
execute as @a[team=lobby,tag=!ranger,gamemode=adventure] at @s if block ~ ~-1 ~ lime_stained_glass if block ~ ~-2 ~ verdant_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/ranger
execute as @a[team=lobby,tag=!burst,gamemode=adventure] at @s if block ~ ~-1 ~ yellow_stained_glass if block ~ ~-2 ~ glowstone if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/burst
execute as @a[team=lobby,tag=!sentry,gamemode=adventure] at @s if block ~ ~-1 ~ pink_stained_glass if block ~ ~-2 ~ pink_glazed_terracotta if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sentry
execute as @a[team=lobby,tag=!covert,gamemode=adventure] at @s if block ~ ~-1 ~ brown_stained_glass if block ~ ~-2 ~ ochre_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/covert

# TDM: allow pad selection directly for active Red/Blue players.
execute as @a[tag=Red,tag=!marksman,gamemode=adventure] at @s if block ~ ~-1 ~ blue_stained_glass if block ~ ~-2 ~ sea_lantern if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/marksman
execute as @a[tag=Red,tag=!breacher,gamemode=adventure] at @s if block ~ ~-1 ~ orange_stained_glass if block ~ ~-2 ~ honeycomb_block if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/breacher
execute as @a[tag=Red,tag=!flanker,gamemode=adventure] at @s if block ~ ~-1 ~ light_blue_stained_glass if block ~ ~-2 ~ prismarine if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/flanker
execute as @a[tag=Red,tag=!assault,gamemode=adventure] at @s if block ~ ~-1 ~ red_stained_glass if block ~ ~-2 ~ shroomlight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/assault
execute as @a[tag=Red,tag=!sniper,gamemode=adventure] at @s if block ~ ~-1 ~ purple_stained_glass if block ~ ~-2 ~ pearlescent_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sniper
execute as @a[tag=Red,tag=!ranger,gamemode=adventure] at @s if block ~ ~-1 ~ lime_stained_glass if block ~ ~-2 ~ verdant_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/ranger
execute as @a[tag=Red,tag=!burst,gamemode=adventure] at @s if block ~ ~-1 ~ yellow_stained_glass if block ~ ~-2 ~ glowstone if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/burst
execute as @a[tag=Red,tag=!sentry,gamemode=adventure] at @s if block ~ ~-1 ~ pink_stained_glass if block ~ ~-2 ~ pink_glazed_terracotta if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sentry
execute as @a[tag=Red,tag=!covert,gamemode=adventure] at @s if block ~ ~-1 ~ brown_stained_glass if block ~ ~-2 ~ ochre_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/covert
execute as @a[tag=Blue,tag=!marksman,gamemode=adventure] at @s if block ~ ~-1 ~ blue_stained_glass if block ~ ~-2 ~ sea_lantern if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/marksman
execute as @a[tag=Blue,tag=!breacher,gamemode=adventure] at @s if block ~ ~-1 ~ orange_stained_glass if block ~ ~-2 ~ honeycomb_block if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/breacher
execute as @a[tag=Blue,tag=!flanker,gamemode=adventure] at @s if block ~ ~-1 ~ light_blue_stained_glass if block ~ ~-2 ~ prismarine if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/flanker
execute as @a[tag=Blue,tag=!assault,gamemode=adventure] at @s if block ~ ~-1 ~ red_stained_glass if block ~ ~-2 ~ shroomlight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/assault
execute as @a[tag=Blue,tag=!sniper,gamemode=adventure] at @s if block ~ ~-1 ~ purple_stained_glass if block ~ ~-2 ~ pearlescent_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sniper
execute as @a[tag=Blue,tag=!ranger,gamemode=adventure] at @s if block ~ ~-1 ~ lime_stained_glass if block ~ ~-2 ~ verdant_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/ranger
execute as @a[tag=Blue,tag=!burst,gamemode=adventure] at @s if block ~ ~-1 ~ yellow_stained_glass if block ~ ~-2 ~ glowstone if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/burst
execute as @a[tag=Blue,tag=!sentry,gamemode=adventure] at @s if block ~ ~-1 ~ pink_stained_glass if block ~ ~-2 ~ pink_glazed_terracotta if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/sentry
execute as @a[tag=Blue,tag=!covert,gamemode=adventure] at @s if block ~ ~-1 ~ brown_stained_glass if block ~ ~-2 ~ ochre_froglight if block ~ ~-3 ~ dried_kelp_block run function gun:selectors/covert
