// Shared helpers for Gambit KubeJS scripts.
// Loads before gambit_maps.js and gambit_utils.js (alphabetical).

function hasTagSafe(player, tagName) {
  if (!player || !tagName) return false;
  try {
    if (player.hasTag) return player.hasTag(tagName);
  } catch (e) {
  }

  try {
    if (player.tags && player.tags.includes) return player.tags.includes(tagName);
  } catch (e) {
  }

  try {
    if (player.tags && player.tags.contains) return player.tags.contains(tagName);
  } catch (e) {
  }

  return false;
}

function getPlayerName(player) {
  return player && player.name && player.name.string ? player.name.string : null;
}

var GAMBIT_KIT_REGISTRY_PATH = 'kubejs/data/gambit_kits.json';
var GAMBIT_DEFAULT_KITS = [
  { id: 'marksman', display: 'Marksman' },
  { id: 'breacher', display: 'Breacher' },
  { id: 'flanker', display: 'Flanker' },
  { id: 'assault', display: 'Assault' },
  { id: 'sniper', display: 'Sniper' },
  { id: 'ranger', display: 'Ranger' },
  { id: 'burst', display: 'Burst' },
  { id: 'sentry', display: 'Sentry' },
  { id: 'covert', display: 'Covert' },
  { id: 'gunslinger', display: 'Gunslinger' }
];

function gambitLoadKitRegistry() {
  try {
    var raw = JsonIO.read(GAMBIT_KIT_REGISTRY_PATH);
    if (!raw || !raw.kits || raw.kits.length <= 0) return GAMBIT_DEFAULT_KITS;

    var out = [];
    var seen = {};
    for (var i = 0; i < raw.kits.length; i++) {
      var kit = raw.kits[i];
      if (!kit || !kit.id) continue;
      var id = String(kit.id);
      if (seen[id]) continue;
      seen[id] = true;
      out.push({
        id: id,
        display: kit.display ? String(kit.display) : id
      });
    }
    return out.length > 0 ? out : GAMBIT_DEFAULT_KITS;
  } catch (e) {
    console.warn('[Gambit] Failed to load kit registry, using built-in fallback: ' + e);
    return GAMBIT_DEFAULT_KITS;
  }
}

function gambitKitKeysFromRegistry(registry) {
  var keys = [];
  for (var i = 0; i < registry.length; i++) {
    if (registry[i] && registry[i].id) keys.push(String(registry[i].id));
  }
  return keys;
}

var GAMBIT_KITS = gambitLoadKitRegistry();
var GAMBIT_KIT_KEYS = gambitKitKeysFromRegistry(GAMBIT_KITS);
