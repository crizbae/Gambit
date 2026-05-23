# Called when a player leaves the shooting range volume.
# Strips range tags, clears kit items, and restores the lobby guide.
tag @s remove in_range
tag @s remove range_kitted
clear @s
function gun:lobby/give_guide
gambit_restore_vote_paper
