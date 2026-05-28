// gambit_db.js — MySQL helper. Loads before other gambit_*.js scripts.

var GAMBIT_DB_CONFIG_PATH = 'kubejs/data/gambit_db_config.json';
var GAMBIT_DB_REQUIRED = true;

var _gambitDb = {
  config: null,
  connection: null,
  enabled: false,
  driverLoaded: false,
  driverInstance: null  // set when loaded via URLClassLoader fallback
};
// Safe baseline for hosts where ALTER TABLE privileges are restricted.
// Keeping writes <= 32 avoids runtime truncation failures even if schema migration is blocked.
var GAMBIT_DB_PLAYER_NAME_MAX = 32;

function _gambitDbNormalizePlayerName(nameCandidate, fallbackKey) {
  var s = '';
  try { s = String(nameCandidate == null ? '' : nameCandidate).trim(); } catch (e) { s = ''; }
  if (!s && fallbackKey != null) {
    try { s = String(fallbackKey).trim(); } catch (e2) { s = ''; }
  }
  if (!s) s = 'unknown';
  if (s.length > GAMBIT_DB_PLAYER_NAME_MAX) s = s.substring(0, GAMBIT_DB_PLAYER_NAME_MAX);
  return s;
}

// Try to find the MySQL connector JAR under libraries/com/mysql/mysql-connector-j/
// Returns the File object if found, null otherwise.
function _gambitFindDriverJar() {
  try {
    var File = Java.loadClass('java.io.File');
    var root = new File('libraries/com/mysql/mysql-connector-j');
    if (!root.isDirectory()) return null;
    var versions = root.listFiles();
    if (!versions) return null;
    for (var vi = 0; vi < versions.length; vi++) {
      if (!versions[vi].isDirectory()) continue;
      var jars = versions[vi].listFiles();
      if (!jars) continue;
      for (var ji = 0; ji < jars.length; ji++) {
        var n = jars[ji].getName();
        if (n.indexOf('mysql-connector') !== -1 && n.lastIndexOf('.jar') === n.length - 4) {
          return jars[ji];
        }
      }
    }
  } catch (e) {}
  return null;
}

(function() {
  // 1. Try normal class lookup (works if JAR is on the mod classloader).
  try {
    Java.loadClass('com.mysql.cj.jdbc.Driver');
    _gambitDb.driverLoaded = true;
    return;
  } catch (e) {}
  try {
    Java.loadClass('com.mysql.jdbc.Driver');
    _gambitDb.driverLoaded = true;
    return;
  } catch (e) {}

  // 2. Fallback: load the JAR directly via URLClassLoader.
  try {
    var jarFile = _gambitFindDriverJar();
    if (!jarFile) {
      console.warn('[Gambit DB] MySQL driver JAR not found under libraries/com/mysql/mysql-connector-j/.');
      return;
    }
    var URLClassLoader = Java.loadClass('java.net.URLClassLoader');
    var parentLoader = Java.loadClass('java.lang.Object').class.getClassLoader();
    var ucl = new URLClassLoader([jarFile.toURI().toURL()], parentLoader);
    var driverClass;
    try {
      driverClass = ucl.loadClass('com.mysql.cj.jdbc.Driver');
    } catch (e) {
      driverClass = ucl.loadClass('com.mysql.jdbc.Driver');
    }
    _gambitDb.driverInstance = driverClass.getDeclaredConstructor().newInstance();
    _gambitDb.driverLoaded = true;
    console.info('[Gambit DB] MySQL driver loaded via URLClassLoader from ' + jarFile.getPath());
  } catch (e) {
    console.warn('[Gambit DB] URLClassLoader driver load failed: ' + e);
  }
})();

function gambitDbLoadConfig() {
  try {
    var raw = JsonIO.read(GAMBIT_DB_CONFIG_PATH);
    if (raw && raw.enabled) {
      if (!_gambitDb.driverLoaded) {
        console.warn('[Gambit DB] MySQL is enabled in config but the JDBC driver was not found.');
        console.warn('[Gambit DB] Place mysql-connector-j-*.jar under libraries/com/mysql/mysql-connector-j/<version>/ and restart.');
        _gambitDb.enabled = false;
        return false;
      }
      _gambitDb.config = {
        host: String(raw.host || 'localhost'),
        port: Number(raw.port || 3306),
        database: String(raw.database || 'gambit'),
        username: String(raw.username || 'root'),
        password: String(raw.password || '')
      };
      _gambitDb.enabled = true;
      return true;
    }
  } catch (e) {
    console.warn('[Gambit DB] Could not read config: ' + e);
  }
  _gambitDb.enabled = false;
  if (GAMBIT_DB_REQUIRED) {
    console.error('[Gambit DB] MySQL is required for Gambit stats and analytics. Create ' + GAMBIT_DB_CONFIG_PATH + ' with enabled=true.');
  }
  return false;
}

function gambitDbConnect() {
  if (!_gambitDb.enabled || !_gambitDb.driverLoaded || !_gambitDb.config) return false;

  try {
    if (_gambitDb.connection && !_gambitDb.connection.isClosed()) return true;
  } catch (e) {}

  var cfg = _gambitDb.config;
  var url = 'jdbc:mysql://' + cfg.host + ':' + cfg.port + '/' + cfg.database
    + '?useSSL=false&allowPublicKeyRetrieval=true&autoReconnect=true'
    + '&connectTimeout=5000&socketTimeout=10000&serverTimezone=UTC';

  try {
    if (_gambitDb.driverInstance) {
      // Driver was loaded via URLClassLoader — connect through the driver instance directly
      // because DriverManager won't see a driver loaded by a child classloader.
      var Properties = Java.loadClass('java.util.Properties');
      var props = new Properties();
      props.setProperty('user', cfg.username);
      props.setProperty('password', cfg.password);
      _gambitDb.connection = _gambitDb.driverInstance.connect(url, props);
      if (!_gambitDb.connection) throw new Error('driver.connect() returned null — URL not accepted');
    } else {
      var DriverManager = Java.loadClass('java.sql.DriverManager');
      _gambitDb.connection = DriverManager.getConnection(url, cfg.username, cfg.password);
    }
    console.info('[Gambit DB] Connected to MySQL at ' + cfg.host + ':' + cfg.port + '/' + cfg.database);
    return true;
  } catch (e) {
    console.error('[Gambit DB] Connection failed: ' + e);
    _gambitDb.connection = null;
    return false;
  }
}

function gambitDbDisconnect() {
  try {
    if (_gambitDb.connection && !_gambitDb.connection.isClosed()) {
      _gambitDb.connection.close();
      console.info('[Gambit DB] Disconnected from MySQL.');
    }
  } catch (e) {}
  _gambitDb.connection = null;
}

function gambitDbIsConnected() {
  if (!_gambitDb.connection) return false;
  try {
    if (_gambitDb.connection.isClosed()) return false;
    // isValid() actually pings the server; catches silently-dropped TCP connections
    // that isClosed() alone cannot detect (e.g. MySQL wait_timeout expiry).
    return _gambitDb.connection.isValid(2);
  } catch (e) { return false; }
}

function gambitDbGetConnection() {
  if (gambitDbIsConnected()) return _gambitDb.connection;
  if (gambitDbConnect()) return _gambitDb.connection;
  return null;
}

function gambitDbIsEnabled() {
  return _gambitDb.enabled && _gambitDb.driverLoaded;
}

function gambitDbIsRequired() {
  return !!GAMBIT_DB_REQUIRED;
}

function gambitDbRequireReady(context) {
  var label = context ? String(context) : 'operation';
  if (gambitDbIsEnabled() && gambitDbGetConnection()) return true;
  console.error('[Gambit DB] MySQL is required but unavailable for ' + label + '. Stats will use local JSON only as an emergency fallback.');
  return false;
}

function gambitDbInitTables() {
  var conn = gambitDbGetConnection();
  if (!conn) return false;

  try {
    var stmt = conn.createStatement();

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_player_stats ('
      + ' player_name VARCHAR(64) NOT NULL PRIMARY KEY,'
      + ' player_uuid VARCHAR(36) DEFAULT NULL,'
      + ' damage DOUBLE NOT NULL DEFAULT 0,'
      + ' kills INT NOT NULL DEFAULT 0,'
      + ' deaths INT NOT NULL DEFAULT 0,'
      + ' matches_played INT NOT NULL DEFAULT 0,'
      + ' wins INT NOT NULL DEFAULT 0,'
      + ' mvps INT NOT NULL DEFAULT 0,'
      + ' assists INT NOT NULL DEFAULT 0,'
      + ' longest_streak INT NOT NULL DEFAULT 0,'
      + ' revives INT NOT NULL DEFAULT 0,'
      + ' elim_score_total DOUBLE NOT NULL DEFAULT 0,'
      + ' elim_matches INT NOT NULL DEFAULT 0,'
      + ' tdm_score_total DOUBLE NOT NULL DEFAULT 0,'
      + ' tdm_matches INT NOT NULL DEFAULT 0,'
      + ' updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,'
      + ' UNIQUE KEY idx_uuid (player_uuid)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    // Migration: add columns that may be missing from older installations.
    // Each ALTER TABLE is run individually; MySQL error 1060 (Duplicate column name)
    // is silently ignored because it just means the column already exists.
    var psColMigrations = [
      ['gambit_player_stats', 'assists',          'INT NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'longest_streak',   'INT NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'revives',          'INT NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'elim_score_total', 'DOUBLE NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'elim_matches',     'INT NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'tdm_score_total',  'DOUBLE NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'tdm_matches',      'INT NOT NULL DEFAULT 0'],
      ['gambit_player_stats', 'player_uuid',       'VARCHAR(36) DEFAULT NULL']
    ];
    for (var mci = 0; mci < psColMigrations.length; mci++) {
      try {
        var mStmt = conn.createStatement();
        mStmt.executeUpdate('ALTER TABLE ' + psColMigrations[mci][0]
          + ' ADD COLUMN ' + psColMigrations[mci][1] + ' ' + psColMigrations[mci][2]);
        mStmt.close();
        console.info('[Gambit DB] Migration: added ' + psColMigrations[mci][0] + '.' + psColMigrations[mci][1]);
      } catch (mColErr) {
        var mColMsg = String(mColErr);
        if (mColMsg.indexOf('Duplicate column') === -1 && mColMsg.indexOf('1060') === -1) {
          console.warn('[Gambit DB] Migration warning: ' + mColErr);
        }
      }
    }

    // Ensure player_name can store UUID fallback names (36 chars) and any future aliases.
    try {
      var _nameStatsStmt = conn.createStatement();
      _nameStatsStmt.executeUpdate('ALTER TABLE gambit_player_stats MODIFY COLUMN player_name VARCHAR(64) NOT NULL');
      _nameStatsStmt.close();
    } catch (_nameStatsErr) {
      var _nameStatsMsg = String(_nameStatsErr);
      if (_nameStatsMsg.indexOf('Data truncated') === -1 && _nameStatsMsg.indexOf('1265') === -1) {
        console.warn('[Gambit DB] Migration warning (player_stats.player_name): ' + _nameStatsErr);
      }
    }

      // After adding the player_uuid column, ensure the UNIQUE index exists.
      // Error 1061 (Duplicate key name) is silently ignored if the index already exists.
      try {
        var _idxStmt = conn.createStatement();
        _idxStmt.executeUpdate('ALTER TABLE gambit_player_stats ADD UNIQUE INDEX idx_uuid (player_uuid)');
        _idxStmt.close();
        console.info('[Gambit DB] Migration: added gambit_player_stats UNIQUE INDEX idx_uuid');
      } catch (_idxErr) {
        var _idxMsg = String(_idxErr);
        if (_idxMsg.indexOf('Duplicate key') === -1 && _idxMsg.indexOf('1061') === -1) {
          console.warn('[Gambit DB] Migration warning (idx_uuid): ' + _idxErr);
        }
      }

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_match_history ('
      + ' match_id INT AUTO_INCREMENT PRIMARY KEY,'
      + ' map_name VARCHAR(64) NOT NULL,'
      + ' map_id INT NOT NULL DEFAULT 0,'
      + ' mode VARCHAR(16) NOT NULL,'
      + ' winner VARCHAR(8) NOT NULL,'
      + ' duration_seconds INT NOT NULL DEFAULT 0,'
      + ' played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_played_at (played_at),'
      + ' INDEX idx_map_name (map_name)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_match_players ('
      + ' id INT AUTO_INCREMENT PRIMARY KEY,'
      + ' match_id INT NOT NULL,'
      + ' player_name VARCHAR(64) NOT NULL,'
      + ' team VARCHAR(8) NOT NULL,'
      + ' kills INT NOT NULL DEFAULT 0,'
      + ' deaths INT NOT NULL DEFAULT 0,'
      + ' damage DOUBLE NOT NULL DEFAULT 0,'
      + ' assists INT NOT NULL DEFAULT 0,'
      + ' match_score DOUBLE NOT NULL DEFAULT 0,'
      + ' FOREIGN KEY (match_id) REFERENCES gambit_match_history(match_id) ON DELETE CASCADE,'
      + ' INDEX idx_player (player_name),'
      + ' INDEX idx_match (match_id)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    // Migration for gambit_match_players
    var mpColMigrations = [
      ['gambit_match_players', 'assists',     'INT NOT NULL DEFAULT 0'],
      ['gambit_match_players', 'match_score', 'DOUBLE NOT NULL DEFAULT 0']
    ];
    for (var mpi = 0; mpi < mpColMigrations.length; mpi++) {
      try {
        var mpStmt = conn.createStatement();
        mpStmt.executeUpdate('ALTER TABLE ' + mpColMigrations[mpi][0]
          + ' ADD COLUMN ' + mpColMigrations[mpi][1] + ' ' + mpColMigrations[mpi][2]);
        mpStmt.close();
        console.info('[Gambit DB] Migration: added ' + mpColMigrations[mpi][0] + '.' + mpColMigrations[mpi][1]);
      } catch (mpErr) {
        var mpErrMsg = String(mpErr);
        if (mpErrMsg.indexOf('Duplicate column') === -1 && mpErrMsg.indexOf('1060') === -1) {
          console.warn('[Gambit DB] Migration warning: ' + mpErr);
        }
      }
    }

    try {
      var _nameMatchStmt = conn.createStatement();
      _nameMatchStmt.executeUpdate('ALTER TABLE gambit_match_players MODIFY COLUMN player_name VARCHAR(64) NOT NULL');
      _nameMatchStmt.close();
    } catch (_nameMatchErr) {
      var _nameMatchMsg = String(_nameMatchErr);
      if (_nameMatchMsg.indexOf('Data truncated') === -1 && _nameMatchMsg.indexOf('1265') === -1) {
        console.warn('[Gambit DB] Migration warning (match_players.player_name): ' + _nameMatchErr);
      }
    }

    // ── Analytics dimensions ─────────────────────────────────
    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_dim_modes ('
      + ' mode_id TINYINT NOT NULL PRIMARY KEY,'
      + ' mode_key VARCHAR(16) NOT NULL UNIQUE,'
      + ' display_name VARCHAR(32) NOT NULL,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_dim_maps ('
      + ' map_id INT NOT NULL PRIMARY KEY,'
      + ' map_key VARCHAR(64) NOT NULL,'
      + ' display_name VARCHAR(64) NOT NULL,'
      + ' active TINYINT(1) NOT NULL DEFAULT 1,'
      + ' introduced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,'
      + ' INDEX idx_map_key (map_key)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_dim_kits ('
      + ' kit_id INT AUTO_INCREMENT PRIMARY KEY,'
      + ' kit_key VARCHAR(32) NOT NULL UNIQUE,'
      + ' display_name VARCHAR(64) NOT NULL,'
      + ' active TINYINT(1) NOT NULL DEFAULT 1,'
      + ' introduced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    // ── Analytics fact tables ────────────────────────────────
    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_sessions ('
      + ' session_id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' label VARCHAR(64) DEFAULT NULL,'
      + ' started_at_utc DATETIME NOT NULL,'
      + ' ended_at_utc DATETIME DEFAULT NULL,'
      + ' server_instance VARCHAR(64) DEFAULT NULL,'
      + ' created_by VARCHAR(64) DEFAULT NULL,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_sessions_active (ended_at_utc),'
      + ' INDEX idx_sessions_started (started_at_utc)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_matches ('
      + ' analytics_match_id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' legacy_match_id INT DEFAULT NULL,'
      + ' session_id BIGINT DEFAULT NULL,'
      + ' map_id INT NOT NULL DEFAULT 0,'
      + ' mode_id TINYINT NOT NULL DEFAULT 0,'
      + ' winner_team VARCHAR(8) NOT NULL,'
      + ' started_at_utc DATETIME DEFAULT NULL,'
      + ' ended_at_utc DATETIME DEFAULT NULL,'
      + ' duration_seconds INT NOT NULL DEFAULT 0,'
      + ' server_instance VARCHAR(64) DEFAULT NULL,'
      + ' is_tournament TINYINT(1) NOT NULL DEFAULT 0,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_matches_started (started_at_utc),'
      + ' INDEX idx_matches_session (session_id),'
      + ' INDEX idx_matches_map_mode (map_id, mode_id),'
      + ' INDEX idx_matches_winner (winner_team),'
      + ' INDEX idx_matches_legacy (legacy_match_id),'
      + ' CONSTRAINT fk_gambit_matches_map FOREIGN KEY (map_id) REFERENCES gambit_dim_maps(map_id),'
      + ' CONSTRAINT fk_gambit_matches_mode FOREIGN KEY (mode_id) REFERENCES gambit_dim_modes(mode_id)'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_match_player_stats ('
      + ' id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' analytics_match_id BIGINT NOT NULL,'
      + ' player_uuid VARCHAR(36) DEFAULT NULL,'
      + ' player_name VARCHAR(64) NOT NULL,'
      + ' team VARCHAR(8) NOT NULL,'
      + ' kills INT NOT NULL DEFAULT 0,'
      + ' deaths INT NOT NULL DEFAULT 0,'
      + ' assists INT NOT NULL DEFAULT 0,'
      + ' damage DOUBLE NOT NULL DEFAULT 0,'
      + ' match_score DOUBLE NOT NULL DEFAULT 0,'
      + ' mvp_flag TINYINT(1) NOT NULL DEFAULT 0,'
      + ' revives INT NOT NULL DEFAULT 0,'
      + ' downs INT NOT NULL DEFAULT 0,'
      + ' longest_streak_match INT NOT NULL DEFAULT 0,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_mps_match (analytics_match_id),'
      + ' INDEX idx_mps_player (player_uuid, player_name),'
      + ' INDEX idx_mps_team (team),'
      + ' CONSTRAINT fk_mps_match FOREIGN KEY (analytics_match_id) REFERENCES gambit_matches(analytics_match_id) ON DELETE CASCADE'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    try {
      var _sessionColStmt = conn.createStatement();
      _sessionColStmt.executeUpdate('ALTER TABLE gambit_matches ADD COLUMN session_id BIGINT DEFAULT NULL AFTER legacy_match_id');
      _sessionColStmt.close();
      console.info('[Gambit DB] Migration: added gambit_matches.session_id');
    } catch (_sessionColErr) {
      var _sessionColMsg = String(_sessionColErr);
      if (_sessionColMsg.indexOf('Duplicate column') === -1 && _sessionColMsg.indexOf('1060') === -1) {
        console.warn('[Gambit DB] Migration warning (matches.session_id): ' + _sessionColErr);
      }
    }
    try {
      var _sessionIdxStmt = conn.createStatement();
      _sessionIdxStmt.executeUpdate('ALTER TABLE gambit_matches ADD INDEX idx_matches_session (session_id)');
      _sessionIdxStmt.close();
    } catch (_sessionIdxErr) {
      var _sessionIdxMsg = String(_sessionIdxErr);
      if (_sessionIdxMsg.indexOf('Duplicate key') === -1 && _sessionIdxMsg.indexOf('1061') === -1) {
        console.warn('[Gambit DB] Migration warning (matches.session index): ' + _sessionIdxErr);
      }
    }

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_match_votes ('
      + ' id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' analytics_match_id BIGINT NOT NULL,'
      + ' vote_round_id BIGINT DEFAULT NULL,'
      + ' player_uuid VARCHAR(36) DEFAULT NULL,'
      + ' player_name VARCHAR(64) NOT NULL,'
      + ' voted_map_id INT DEFAULT NULL,'
      + ' voted_mode_id TINYINT DEFAULT NULL,'
      + ' was_random_vote TINYINT(1) NOT NULL DEFAULT 0,'
      + ' voted_at_utc DATETIME DEFAULT NULL,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_votes_match (analytics_match_id),'
      + ' INDEX idx_votes_round (vote_round_id),'
      + ' INDEX idx_votes_map_mode (voted_map_id, voted_mode_id),'
      + ' CONSTRAINT fk_votes_match FOREIGN KEY (analytics_match_id) REFERENCES gambit_matches(analytics_match_id) ON DELETE CASCADE'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_match_kit_usage ('
      + ' id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' analytics_match_id BIGINT NOT NULL,'
      + ' player_uuid VARCHAR(36) DEFAULT NULL,'
      + ' player_name VARCHAR(64) NOT NULL,'
      + ' kit_key VARCHAR(32) NOT NULL,'
      + ' selected_at_utc DATETIME DEFAULT NULL,'
      + ' deselected_at_utc DATETIME DEFAULT NULL,'
      + ' active_seconds INT NOT NULL DEFAULT 0,'
      + ' is_initial_pick TINYINT(1) NOT NULL DEFAULT 0,'
      + ' selection_reason VARCHAR(32) DEFAULT NULL,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_kit_usage_match (analytics_match_id),'
      + ' INDEX idx_kit_usage_kit (kit_key),'
      + ' INDEX idx_kit_usage_player (player_uuid, player_name),'
      + ' CONSTRAINT fk_kit_usage_match FOREIGN KEY (analytics_match_id) REFERENCES gambit_matches(analytics_match_id) ON DELETE CASCADE'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    // Optional generic event stream for future analytics.
    stmt.executeUpdate(
      'CREATE TABLE IF NOT EXISTS gambit_player_events ('
      + ' id BIGINT AUTO_INCREMENT PRIMARY KEY,'
      + ' analytics_match_id BIGINT DEFAULT NULL,'
      + ' event_type VARCHAR(32) NOT NULL,'
      + ' actor_uuid VARCHAR(36) DEFAULT NULL,'
      + ' actor_name VARCHAR(64) DEFAULT NULL,'
      + ' target_uuid VARCHAR(36) DEFAULT NULL,'
      + ' target_name VARCHAR(64) DEFAULT NULL,'
      + ' map_id INT DEFAULT NULL,'
      + ' mode_id TINYINT DEFAULT NULL,'
      + ' event_time_utc DATETIME DEFAULT NULL,'
      + ' payload_json TEXT DEFAULT NULL,'
      + ' created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'
      + ' INDEX idx_events_match (analytics_match_id),'
      + ' INDEX idx_events_type_time (event_type, event_time_utc),'
      + ' INDEX idx_events_actor (actor_uuid, actor_name),'
      + ' INDEX idx_events_target (target_uuid, target_name),'
      + ' CONSTRAINT fk_events_match FOREIGN KEY (analytics_match_id) REFERENCES gambit_matches(analytics_match_id) ON DELETE SET NULL'
      + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    // ── Analytics views ─────────────────────────────────────
    // These are convenience rollups for dashboards/admin queries.
    stmt.executeUpdate(
      'CREATE OR REPLACE VIEW gambit_v_map_votes AS '
      + 'SELECT '
      + '  COALESCE(v.voted_map_id, 0) AS map_id, '
      + '  COALESCE(m.display_name, CONCAT(\'Map #\', COALESCE(v.voted_map_id, 0))) AS map_name, '
      + '  COALESCE(v.voted_mode_id, -1) AS mode_id, '
      + '  COALESCE(md.display_name, \'Unknown\') AS mode_name, '
      + '  COUNT(*) AS vote_count, '
      + '  COUNT(DISTINCT COALESCE(v.player_uuid, v.player_name)) AS unique_voters, '
      + '  SUM(CASE WHEN v.was_random_vote = 1 THEN 1 ELSE 0 END) AS random_vote_count, '
      + '  MIN(v.voted_at_utc) AS first_vote_utc, '
      + '  MAX(v.voted_at_utc) AS last_vote_utc '
      + 'FROM gambit_match_votes v '
      + 'LEFT JOIN gambit_dim_maps m ON m.map_id = v.voted_map_id '
      + 'LEFT JOIN gambit_dim_modes md ON md.mode_id = v.voted_mode_id '
      + 'GROUP BY COALESCE(v.voted_map_id, 0), COALESCE(m.display_name, CONCAT(\'Map #\', COALESCE(v.voted_map_id, 0))), COALESCE(v.voted_mode_id, -1), COALESCE(md.display_name, \'Unknown\')'
    );

    stmt.executeUpdate(
      'CREATE OR REPLACE VIEW gambit_v_map_plays AS '
      + 'SELECT '
      + '  gm.map_id AS map_id, '
      + '  COALESCE(dm.display_name, CONCAT(\'Map #\', gm.map_id)) AS map_name, '
      + '  gm.mode_id AS mode_id, '
      + '  COALESCE(md.display_name, \'Unknown\') AS mode_name, '
      + '  COUNT(*) AS matches_played, '
      + '  ROUND((COUNT(*) / NULLIF((SELECT COUNT(*) FROM gambit_matches), 0)) * 100, 2) AS play_share_pct, '
      + '  SUM(CASE WHEN gm.winner_team = \'red\' THEN 1 ELSE 0 END) AS red_wins, '
      + '  SUM(CASE WHEN gm.winner_team = \'blue\' THEN 1 ELSE 0 END) AS blue_wins, '
      + '  SUM(CASE WHEN gm.winner_team NOT IN (\'red\', \'blue\') THEN 1 ELSE 0 END) AS non_team_wins, '
      + '  ROUND(AVG(COALESCE(gm.duration_seconds, 0)), 2) AS avg_duration_seconds, '
      + '  MIN(gm.started_at_utc) AS first_played_utc, '
      + '  MAX(gm.started_at_utc) AS last_played_utc '
      + 'FROM gambit_matches gm '
      + 'LEFT JOIN gambit_dim_maps dm ON dm.map_id = gm.map_id '
      + 'LEFT JOIN gambit_dim_modes md ON md.mode_id = gm.mode_id '
      + 'GROUP BY gm.map_id, COALESCE(dm.display_name, CONCAT(\'Map #\', gm.map_id)), gm.mode_id, COALESCE(md.display_name, \'Unknown\')'
    );

    stmt.executeUpdate(
      'CREATE OR REPLACE VIEW gambit_v_kit_popularity AS '
      + 'SELECT '
      + '  LOWER(COALESCE(gku.kit_key, \'unknown\')) AS kit_key, '
      + '  COALESCE(dk.display_name, CONCAT(UCASE(LEFT(LOWER(COALESCE(gku.kit_key, \'unknown\')), 1)), SUBSTRING(LOWER(COALESCE(gku.kit_key, \'unknown\')), 2))) AS kit_name, '
      + '  COUNT(*) AS selection_count, '
      + '  ROUND((COUNT(*) / NULLIF((SELECT COUNT(*) FROM gambit_match_kit_usage), 0)) * 100, 2) AS selection_share_pct, '
      + '  COUNT(DISTINCT gku.analytics_match_id) AS matches_with_kit, '
      + '  COUNT(DISTINCT COALESCE(gku.player_uuid, gku.player_name)) AS unique_players, '
      + '  SUM(COALESCE(gku.active_seconds, 0)) AS total_active_seconds, '
      + '  ROUND(AVG(COALESCE(gku.active_seconds, 0)), 2) AS avg_active_seconds '
      + 'FROM gambit_match_kit_usage gku '
      + 'LEFT JOIN gambit_dim_kits dk ON dk.kit_key = LOWER(gku.kit_key) '
      + 'GROUP BY LOWER(COALESCE(gku.kit_key, \'unknown\')), COALESCE(dk.display_name, CONCAT(UCASE(LEFT(LOWER(COALESCE(gku.kit_key, \'unknown\')), 1)), SUBSTRING(LOWER(COALESCE(gku.kit_key, \'unknown\')), 2)))'
    );

    stmt.executeUpdate(
      'CREATE OR REPLACE VIEW gambit_v_map_votes_vs_plays AS '
      + 'SELECT '
      + '  p.map_id, '
      + '  p.map_name, '
      + '  p.mode_id, '
      + '  p.mode_name, '
      + '  COALESCE(v.vote_count, 0) AS vote_count, '
      + '  p.matches_played, '
      + '  ROUND(COALESCE(v.vote_count, 0) / NULLIF(p.matches_played, 0), 2) AS votes_per_play '
      + 'FROM gambit_v_map_plays p '
      + 'LEFT JOIN gambit_v_map_votes v ON v.map_id = p.map_id AND v.mode_id = p.mode_id'
    );

    stmt.close();
    console.info('[Gambit DB] Tables and views ready (legacy + analytics schema).');
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to create tables: ' + e);
    return false;
  }
}

function gambitDbLoadAllStats() {
  var conn = gambitDbGetConnection();
  if (!conn) return null;

  try {
    var stmt = conn.createStatement();
    // Use SELECT * so the query succeeds even if new columns haven't been migrated yet.
    var rs = stmt.executeQuery('SELECT * FROM gambit_player_stats');
    var result = {};
    while (rs.next()) {
      var entry = {
        damage:          rs.getDouble('damage'),
        kills:           rs.getInt('kills'),
        deaths:          rs.getInt('deaths'),
        matches:         rs.getInt('matches_played'),
        wins:            rs.getInt('wins'),
        mvps:            rs.getInt('mvps'),
        assists:         0,
        longest_streak:  0,
        revives:         0,
        elim_score_total: 0,
        elim_matches:    0,
        tdm_score_total: 0,
        tdm_matches:     0
      };
      try { entry.assists        = rs.getInt('assists');            } catch(e) {}
      try { entry.longest_streak = rs.getInt('longest_streak');     } catch(e) {}
      try { entry.revives        = rs.getInt('revives');            } catch(e) {}
      try { entry.elim_score_total = rs.getDouble('elim_score_total'); } catch(e) {}
      try { entry.elim_matches   = rs.getInt('elim_matches');       } catch(e) {}
      try { entry.tdm_score_total  = rs.getDouble('tdm_score_total');  } catch(e) {}
      try { entry.tdm_matches    = rs.getInt('tdm_matches');        } catch(e) {}
      var _puuid = null;
      try { var _puuidRaw = rs.getString('player_uuid'); if (_puuidRaw && _puuidRaw !== '') _puuid = _puuidRaw; } catch(e) {}
      var _pname = rs.getString('player_name');
      var _normalizedName = _gambitDbNormalizePlayerName(_pname, _puuid);
      entry.name = _normalizedName;
      result[_puuid !== null ? _puuid : _normalizedName] = entry;
    }
    rs.close();
    stmt.close();
    return result;
  } catch (e) {
    console.error('[Gambit DB] Failed to load stats: ' + e);
    return null;
  }
}

function gambitDbSavePlayer(playerName, entry) {
  var conn = gambitDbGetConnection();
  if (!conn || !playerName || !entry) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_player_stats (player_name, player_uuid, damage, kills, deaths, matches_played, wins, mvps, assists, longest_streak, revives, elim_score_total, elim_matches, tdm_score_total, tdm_matches)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      + ' ON DUPLICATE KEY UPDATE player_name=VALUES(player_name), player_uuid=COALESCE(VALUES(player_uuid), player_uuid),'
      + ' damage=VALUES(damage), kills=VALUES(kills),'
      + ' deaths=VALUES(deaths), matches_played=VALUES(matches_played),'
      + ' wins=VALUES(wins), mvps=VALUES(mvps),'
      + ' assists=VALUES(assists), longest_streak=VALUES(longest_streak),'
      + ' revives=VALUES(revives), elim_score_total=VALUES(elim_score_total),'
      + ' elim_matches=VALUES(elim_matches), tdm_score_total=VALUES(tdm_score_total),'
      + ' tdm_matches=VALUES(tdm_matches)'
    );
    ps.setString(1, _gambitDbNormalizePlayerName(playerName, null));
    var _uuid = (entry && entry._uuid) ? String(entry._uuid) : null;
    if (_uuid) ps.setString(2, _uuid); else ps.setObject(2, null);
    ps.setDouble(3, Number(entry.damage) || 0);
    ps.setInt(4, Math.floor(Number(entry.kills) || 0) | 0);
    ps.setInt(5, Math.floor(Number(entry.deaths) || 0) | 0);
    ps.setInt(6, Math.floor(Number(entry.matches) || 0) | 0);
    ps.setInt(7, Math.floor(Number(entry.wins) || 0) | 0);
    ps.setInt(8, Math.floor(Number(entry.mvps) || 0) | 0);
    ps.setInt(9, Math.floor(Number(entry.assists) || 0) | 0);
    ps.setInt(10, Math.floor(Number(entry.longest_streak) || 0) | 0);
    ps.setInt(11, Math.floor(Number(entry.revives) || 0) | 0);
    ps.setDouble(12, Number(entry.elim_score_total) || 0);
    ps.setInt(13, Math.floor(Number(entry.elim_matches) || 0) | 0);
    ps.setDouble(14, Number(entry.tdm_score_total) || 0);
    ps.setInt(15, Math.floor(Number(entry.tdm_matches) || 0) | 0);
    ps.executeUpdate();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to save player ' + playerName + ': ' + e);
    return false;
  }
}

function gambitDbSaveAllStats(statsObj) {
  var conn = gambitDbGetConnection();
  if (!conn || !statsObj) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_player_stats (player_name, player_uuid, damage, kills, deaths, matches_played, wins, mvps, assists, longest_streak, revives, elim_score_total, elim_matches, tdm_score_total, tdm_matches)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      + ' ON DUPLICATE KEY UPDATE player_name=VALUES(player_name), player_uuid=COALESCE(VALUES(player_uuid), player_uuid),'
      + ' damage=VALUES(damage), kills=VALUES(kills),'
      + ' deaths=VALUES(deaths), matches_played=VALUES(matches_played),'
      + ' wins=VALUES(wins), mvps=VALUES(mvps),'
      + ' assists=VALUES(assists), longest_streak=VALUES(longest_streak),'
      + ' revives=VALUES(revives), elim_score_total=VALUES(elim_score_total),'
      + ' elim_matches=VALUES(elim_matches), tdm_score_total=VALUES(tdm_score_total),'
      + ' tdm_matches=VALUES(tdm_matches)'
    );

    var keys = Object.keys(statsObj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var e = statsObj[key];
      // key is a UUID for migrated players, a legacy name otherwise
      var pName = _gambitDbNormalizePlayerName(e && e.name, key);
      var pUuid = (key.length === 36 && key.charAt(8) === '-') ? String(key) : null;
      ps.setString(1, pName);
      if (pUuid) ps.setString(2, pUuid); else ps.setObject(2, null);
      ps.setDouble(3, Number(e.damage) || 0);
      ps.setInt(4, Math.floor(Number(e.kills) || 0) | 0);
      ps.setInt(5, Math.floor(Number(e.deaths) || 0) | 0);
      ps.setInt(6, Math.floor(Number(e.matches) || 0) | 0);
      ps.setInt(7, Math.floor(Number(e.wins) || 0) | 0);
      ps.setInt(8, Math.floor(Number(e.mvps) || 0) | 0);
      ps.setInt(9, Math.floor(Number(e.assists) || 0) | 0);
      ps.setInt(10, Math.floor(Number(e.longest_streak) || 0) | 0);
      ps.setInt(11, Math.floor(Number(e.revives) || 0) | 0);
      ps.setDouble(12, Number(e.elim_score_total) || 0);
      ps.setInt(13, Math.floor(Number(e.elim_matches) || 0) | 0);
      ps.setDouble(14, Number(e.tdm_score_total) || 0);
      ps.setInt(15, Math.floor(Number(e.tdm_matches) || 0) | 0);
      ps.addBatch();
    }

    ps.executeBatch();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to batch-save stats: ' + e);
    return false;
  }
}

function gambitDbResetPlayer(keyOrName) {
  var conn = gambitDbGetConnection();
  if (!conn || !keyOrName) return false;
  var key = String(keyOrName);
  var isUuid = key.length === 36 && key.charAt(8) === '-';
  try {
    var ps;
    if (isUuid) {
      ps = conn.prepareStatement(
        'UPDATE gambit_player_stats SET damage=0, kills=0, deaths=0, matches_played=0, wins=0, mvps=0, assists=0, longest_streak=0, revives=0, elim_score_total=0, elim_matches=0, tdm_score_total=0, tdm_matches=0 WHERE player_uuid=?'
      );
      ps.setString(1, key);
    } else {
      ps = conn.prepareStatement(
        'UPDATE gambit_player_stats SET damage=0, kills=0, deaths=0, matches_played=0, wins=0, mvps=0, assists=0, longest_streak=0, revives=0, elim_score_total=0, elim_matches=0, tdm_score_total=0, tdm_matches=0 WHERE player_name=?'
      );
      ps.setString(1, key);
    }
    ps.executeUpdate();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to reset player ' + key + ': ' + e);
    return false;
  }
}

function gambitDbResetAll() {
  var conn = gambitDbGetConnection();
  if (!conn) return false;

  try {
    var stmt = conn.createStatement();
    stmt.executeUpdate(
      'UPDATE gambit_player_stats SET damage=0, kills=0, deaths=0, matches_played=0, wins=0, mvps=0, assists=0, longest_streak=0, revives=0, elim_score_total=0, elim_matches=0, tdm_score_total=0, tdm_matches=0'
    );
    stmt.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to reset all stats: ' + e);
    return false;
  }
}

function gambitDbWipeMatchLogs() {
  var conn = gambitDbGetConnection();
  if (!conn) return { ok: false, error: 'No database connection' };

  try {
    // Delete child table first because of FK gambit_match_players.match_id -> gambit_match_history.match_id
    var stmt = conn.createStatement();
    var deletedPlayers = stmt.executeUpdate('DELETE FROM gambit_match_players');
    var deletedHistory = stmt.executeUpdate('DELETE FROM gambit_match_history');
    stmt.close();
    return {
      ok: true,
      deleted_match_players: deletedPlayers,
      deleted_match_history: deletedHistory
    };
  } catch (e) {
    console.error('[Gambit DB] Failed to wipe match logs: ' + e);
    return { ok: false, error: String(e) };
  }
}

// Returns the auto-generated match_id, or -1 on failure.
function gambitDbInsertMatch(mapName, mapId, mode, winner, durationSeconds) {
  var conn = gambitDbGetConnection();
  if (!conn) return -1;

  try {
    // Use createStatement + string SQL to avoid Rhino's PreparedStatement
    // parameter-index overload resolution bug (passes int indices as double).
    var safeName     = String(mapName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var safeMode     = String(mode).replace(/'/g, "\\'");
    var safeWinner   = String(winner).replace(/'/g, "\\'");
    var safeMapId    = Math.floor(Number(mapId) || 0);
    var safeDuration = Math.floor(Number(durationSeconds) || 0);

    var insertSql = "INSERT INTO gambit_match_history (map_name, map_id, mode, winner, duration_seconds)"
      + " VALUES ('" + safeName + "', " + safeMapId + ", '" + safeMode + "', '" + safeWinner + "', " + safeDuration + ")";

    var stmt = conn.createStatement();
    stmt.executeUpdate(insertSql);
    stmt.close();

    var matchId = -1;
    var idStmt = conn.createStatement();
    var rs = idStmt.executeQuery('SELECT LAST_INSERT_ID() AS last_id');
    if (rs.next()) {
      matchId = parseInt(String(rs.getString('last_id')), 10) || -1;
    }
    rs.close();
    idStmt.close();
    return matchId;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert match: ' + e);
    return -1;
  }
}

function gambitDbInsertMatchPlayers(matchId, players) {
  var conn = gambitDbGetConnection();
  if (!conn || matchId < 0 || !players || players.length === 0) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_match_players (match_id, player_name, team, kills, deaths, damage, assists, match_score)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      ps.setInt(1, matchId | 0);
      ps.setString(2, _gambitDbNormalizePlayerName(p && p.name, null));
      ps.setString(3, String(p.team));
      ps.setInt(4, Math.floor(Number(p.kills) || 0) | 0);
      ps.setInt(5, Math.floor(Number(p.deaths) || 0) | 0);
      ps.setDouble(6, Number(p.damage) || 0);
      ps.setInt(7, Math.floor(Number(p.assists) || 0) | 0);
      ps.setDouble(8, Number(p.match_score) || 0);
      ps.addBatch();
    }

    ps.executeBatch();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert match players: ' + e);
    return false;
  }
}

function _gambitFormatUtcDateTime(ms) {
  try {
    var d = new Date(ms || Date.now());
    var iso = d.toISOString();
    return iso.substring(0, 19).replace('T', ' ');
  } catch (e) {
    return null;
  }
}

function gambitDbSyncDimensions(mapDefs, kitKeys) {
  var conn = gambitDbGetConnection();
  if (!conn) return false;

  try {
    // Modes are fixed for now.
    var modePs = conn.prepareStatement(
      'INSERT INTO gambit_dim_modes (mode_id, mode_key, display_name) VALUES (?, ?, ?)' +
      ' ON DUPLICATE KEY UPDATE mode_key=VALUES(mode_key), display_name=VALUES(display_name)'
    );
    modePs.setInt(1, 0); modePs.setString(2, 'elimination'); modePs.setString(3, 'Elimination'); modePs.addBatch();
    modePs.setInt(1, 1); modePs.setString(2, 'tdm');         modePs.setString(3, 'TDM');         modePs.addBatch();
    modePs.executeBatch();
    modePs.close();

    if (mapDefs && mapDefs.length) {
      var mapPs = conn.prepareStatement(
        'INSERT INTO gambit_dim_maps (map_id, map_key, display_name, active) VALUES (?, ?, ?, 1)' +
        ' ON DUPLICATE KEY UPDATE map_key=VALUES(map_key), display_name=VALUES(display_name), active=1'
      );
      for (var mi = 0; mi < mapDefs.length; mi++) {
        var m = mapDefs[mi];
        if (!m || m.id === undefined || m.id === null) continue;
        mapPs.setInt(1, Math.floor(Number(m.id) || 0));
        mapPs.setString(2, String(m.preset || ('map_' + m.id)));
        mapPs.setString(3, String(m.name || m.preset || ('Map ' + m.id)));
        mapPs.addBatch();
      }
      mapPs.executeBatch();
      mapPs.close();
    }

    if (kitKeys && kitKeys.length) {
      var kitPs = conn.prepareStatement(
        'INSERT INTO gambit_dim_kits (kit_key, display_name, active) VALUES (?, ?, 1)' +
        ' ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), active=1'
      );
      for (var ki = 0; ki < kitKeys.length; ki++) {
        var kk = String(kitKeys[ki] || '').trim();
        if (!kk) continue;
        var disp = kk.charAt(0).toUpperCase() + kk.substring(1);
        kitPs.setString(1, kk.toLowerCase());
        kitPs.setString(2, disp);
        kitPs.addBatch();
      }
      kitPs.executeBatch();
      kitPs.close();
    }

    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to sync analytics dimensions: ' + e);
    return false;
  }
}

function gambitDbGetActiveSession() {
  var conn = gambitDbGetConnection();
  if (!conn) return null;

  try {
    var stmt = conn.createStatement();
    var rs = stmt.executeQuery(
      'SELECT session_id, label, started_at_utc, ended_at_utc FROM gambit_sessions ' +
      'WHERE ended_at_utc IS NULL ORDER BY session_id DESC LIMIT 1'
    );
    var session = null;
    if (rs.next()) {
      session = {
        session_id: Number(rs.getLong('session_id')),
        label: String(rs.getString('label') || ''),
        started_at_utc: String(rs.getString('started_at_utc') || ''),
        ended_at_utc: String(rs.getString('ended_at_utc') || '')
      };
    }
    rs.close();
    stmt.close();
    return session;
  } catch (e) {
    console.error('[Gambit DB] Failed to read active session: ' + e);
    return null;
  }
}

function gambitDbStartSession(label, actorName) {
  var conn = gambitDbGetConnection();
  if (!conn) return { ok: false, error: 'Database unavailable.' };

  var existing = gambitDbGetActiveSession();
  if (existing) return { ok: false, active: existing, error: 'A session is already active.' };

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_sessions (label, started_at_utc, server_instance, created_by) VALUES (?, ?, ?, ?)'
    );
    var cleanLabel = label ? String(label).trim() : '';
    if (cleanLabel.length > 64) cleanLabel = cleanLabel.substring(0, 64);
    if (cleanLabel) ps.setString(1, cleanLabel); else ps.setObject(1, null);
    ps.setString(2, _gambitFormatUtcDateTime(Date.now()));
    ps.setString(3, 'default');
    if (actorName) ps.setString(4, _gambitDbNormalizePlayerName(actorName, null)); else ps.setObject(4, null);
    ps.executeUpdate();
    ps.close();

    var started = gambitDbGetActiveSession();
    return { ok: true, session: started };
  } catch (e) {
    console.error('[Gambit DB] Failed to start session: ' + e);
    return { ok: false, error: String(e) };
  }
}

function gambitDbEndSession(actorName) {
  var conn = gambitDbGetConnection();
  if (!conn) return { ok: false, error: 'Database unavailable.' };

  var active = gambitDbGetActiveSession();
  if (!active) return { ok: false, error: 'No active session.' };

  try {
    var ps = conn.prepareStatement('UPDATE gambit_sessions SET ended_at_utc=? WHERE session_id=? AND ended_at_utc IS NULL');
    ps.setString(1, _gambitFormatUtcDateTime(Date.now()));
    ps.setLong(2, Number(active.session_id));
    ps.executeUpdate();
    ps.close();
    return { ok: true, session: active };
  } catch (e) {
    console.error('[Gambit DB] Failed to end session: ' + e);
    return { ok: false, error: String(e), session: active };
  }
}

function gambitDbGetActiveSessionId() {
  var active = gambitDbGetActiveSession();
  return active ? Number(active.session_id) : null;
}

function gambitDbGetDisplaySession() {
  var active = gambitDbGetActiveSession();
  if (active) return active;

  var conn = gambitDbGetConnection();
  if (!conn) return null;
  try {
    var stmt = conn.createStatement();
    var rs = stmt.executeQuery(
      'SELECT session_id, label, started_at_utc, ended_at_utc FROM gambit_sessions ORDER BY session_id DESC LIMIT 1'
    );
    var session = null;
    if (rs.next()) {
      session = {
        session_id: Number(rs.getLong('session_id')),
        label: String(rs.getString('label') || ''),
        started_at_utc: String(rs.getString('started_at_utc') || ''),
        ended_at_utc: String(rs.getString('ended_at_utc') || '')
      };
    }
    rs.close();
    stmt.close();
    return session;
  } catch (e) {
    console.error('[Gambit DB] Failed to read display session: ' + e);
    return null;
  }
}

function gambitDbGetActiveSessionEntries() {
  var conn = gambitDbGetConnection();
  if (!conn) return null;

  var active = gambitDbGetActiveSession();
  if (!active) return [];

  try {
    var ps = conn.prepareStatement(
      'SELECT ' +
      ' COALESCE(mps.player_uuid, LOWER(mps.player_name)) AS player_key,' +
      ' MAX(mps.player_name) AS player_name,' +
      ' SUM(mps.kills) AS kills,' +
      ' SUM(mps.deaths) AS deaths,' +
      ' SUM(mps.assists) AS assists,' +
      ' SUM(mps.damage) AS damage,' +
      ' COUNT(*) AS matches,' +
      ' SUM(CASE WHEN gm.winner_team = mps.team THEN 1 ELSE 0 END) AS wins,' +
      ' SUM(mps.mvp_flag) AS mvps,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN mps.kills ELSE 0 END) AS elim_kills,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN mps.deaths ELSE 0 END) AS elim_deaths,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN 1 ELSE 0 END) AS elim_matches,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN mps.damage ELSE 0 END) AS elim_damage,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN mps.assists ELSE 0 END) AS elim_assists,' +
      ' SUM(CASE WHEN gm.mode_id = 0 THEN mps.mvp_flag ELSE 0 END) AS elim_mvps,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN mps.kills ELSE 0 END) AS tdm_kills,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN mps.deaths ELSE 0 END) AS tdm_deaths,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN 1 ELSE 0 END) AS tdm_matches,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN mps.damage ELSE 0 END) AS tdm_damage,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN mps.assists ELSE 0 END) AS tdm_assists,' +
      ' SUM(CASE WHEN gm.mode_id = 1 THEN mps.mvp_flag ELSE 0 END) AS tdm_mvps,' +
      ' SUM(mps.revives) AS revives,' +
      ' MAX(mps.longest_streak_match) AS longest_streak ' +
      'FROM gambit_match_player_stats mps ' +
      'JOIN gambit_matches gm ON gm.analytics_match_id = mps.analytics_match_id ' +
      'WHERE gm.session_id = ? ' +
      'GROUP BY COALESCE(mps.player_uuid, LOWER(mps.player_name))'
    );
    ps.setLong(1, Number(active.session_id));
    var rs = ps.executeQuery();
    var arr = [];
    while (rs.next()) {
      var s = {
        date: active.started_at_utc,
        kills: Math.floor(Number(rs.getInt('kills')) || 0),
        deaths: Math.floor(Number(rs.getInt('deaths')) || 0),
        damage: Number(rs.getDouble('damage')) || 0,
        matches: Math.floor(Number(rs.getInt('matches')) || 0),
        wins: Math.floor(Number(rs.getInt('wins')) || 0),
        assists: Math.floor(Number(rs.getInt('assists')) || 0),
        mvps: Math.floor(Number(rs.getInt('mvps')) || 0),
        elim_kills: Math.floor(Number(rs.getInt('elim_kills')) || 0),
        elim_deaths: Math.floor(Number(rs.getInt('elim_deaths')) || 0),
        elim_matches: Math.floor(Number(rs.getInt('elim_matches')) || 0),
        elim_damage: Number(rs.getDouble('elim_damage')) || 0,
        elim_assists: Math.floor(Number(rs.getInt('elim_assists')) || 0),
        elim_mvps: Math.floor(Number(rs.getInt('elim_mvps')) || 0),
        tdm_kills: Math.floor(Number(rs.getInt('tdm_kills')) || 0),
        tdm_deaths: Math.floor(Number(rs.getInt('tdm_deaths')) || 0),
        tdm_matches: Math.floor(Number(rs.getInt('tdm_matches')) || 0),
        tdm_damage: Number(rs.getDouble('tdm_damage')) || 0,
        tdm_assists: Math.floor(Number(rs.getInt('tdm_assists')) || 0),
        tdm_mvps: Math.floor(Number(rs.getInt('tdm_mvps')) || 0),
        longest_streak: Math.floor(Number(rs.getInt('longest_streak')) || 0),
        revives: Math.floor(Number(rs.getInt('revives')) || 0)
      };
      arr.push([String(rs.getString('player_name') || rs.getString('player_key') || 'Unknown'), s]);
    }
    rs.close();
    ps.close();
    return arr;
  } catch (e) {
    console.error('[Gambit DB] Failed to aggregate active session stats: ' + e);
    return null;
  }
}

function gambitDbInsertAnalyticsMatch(meta) {
  var conn = gambitDbGetConnection();
  if (!conn || !meta) return -1;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_matches (legacy_match_id, session_id, map_id, mode_id, winner_team, started_at_utc, ended_at_utc, duration_seconds, server_instance, is_tournament)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    var legacyId = meta.legacy_match_id !== undefined ? Number(meta.legacy_match_id) : null;
    if (legacyId === null || Number.isNaN(legacyId) || legacyId < 0) ps.setObject(1, null); else ps.setInt(1, Math.floor(legacyId));
    var sessionId = meta.session_id !== undefined && meta.session_id !== null ? Number(meta.session_id) : null;
    if (sessionId === null || Number.isNaN(sessionId) || sessionId <= 0) ps.setObject(2, null); else ps.setLong(2, Math.floor(sessionId));
    ps.setInt(3, Math.floor(Number(meta.map_id) || 0));
    ps.setInt(4, Math.floor(Number(meta.mode_id) || 0));
    ps.setString(5, String(meta.winner_team || 'tie'));

    var started = _gambitFormatUtcDateTime(meta.started_at_ms || null);
    var ended   = _gambitFormatUtcDateTime(meta.ended_at_ms || Date.now());
    if (started) ps.setString(6, started); else ps.setObject(6, null);
    if (ended)   ps.setString(7, ended);   else ps.setObject(7, null);
    ps.setInt(8, Math.floor(Number(meta.duration_seconds) || 0));
    ps.setString(9, meta.server_instance ? String(meta.server_instance) : 'default');
    ps.setInt(10, meta.is_tournament ? 1 : 0);

    ps.executeUpdate();
    ps.close();

    var matchId = -1;
    var idStmt = conn.createStatement();
    var rs = idStmt.executeQuery('SELECT LAST_INSERT_ID() AS last_id');
    if (rs.next()) matchId = parseInt(String(rs.getString('last_id')), 10) || -1;
    rs.close();
    idStmt.close();
    return matchId;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert analytics match: ' + e);
    return -1;
  }
}

function gambitDbInsertAnalyticsMatchPlayers(analyticsMatchId, players) {
  var conn = gambitDbGetConnection();
  if (!conn || analyticsMatchId < 0 || !players || players.length === 0) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_match_player_stats (analytics_match_id, player_uuid, player_name, team, kills, deaths, assists, damage, match_score, mvp_flag, revives, downs, longest_streak_match)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (var i = 0; i < players.length; i++) {
      var p = players[i] || {};
      ps.setLong(1, Number(analyticsMatchId));
      var pu = p.uuid ? String(p.uuid) : null;
      if (pu) ps.setString(2, pu); else ps.setObject(2, null);
      ps.setString(3, _gambitDbNormalizePlayerName(p.name, pu));
      ps.setString(4, String(p.team || 'unknown'));
      ps.setInt(5, Math.floor(Number(p.kills) || 0));
      ps.setInt(6, Math.floor(Number(p.deaths) || 0));
      ps.setInt(7, Math.floor(Number(p.assists) || 0));
      ps.setDouble(8, Number(p.damage) || 0);
      ps.setDouble(9, Number(p.match_score) || 0);
      ps.setInt(10, p.is_mvp ? 1 : 0);
      ps.setInt(11, Math.floor(Number(p.revives) || 0));
      ps.setInt(12, Math.floor(Number(p.downs) || 0));
      ps.setInt(13, Math.floor(Number(p.longest_streak_match) || 0));
      ps.addBatch();
    }
    ps.executeBatch();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert analytics match players: ' + e);
    return false;
  }
}

function gambitDbInsertAnalyticsVotes(analyticsMatchId, votes) {
  var conn = gambitDbGetConnection();
  if (!conn || analyticsMatchId < 0 || !votes || votes.length === 0) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_match_votes (analytics_match_id, vote_round_id, player_uuid, player_name, voted_map_id, voted_mode_id, was_random_vote, voted_at_utc)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (var i = 0; i < votes.length; i++) {
      var v = votes[i] || {};
      ps.setLong(1, Number(analyticsMatchId));
      if (v.vote_round_id === undefined || v.vote_round_id === null) ps.setObject(2, null);
      else ps.setLong(2, Number(v.vote_round_id));
      var vu = v.player_uuid ? String(v.player_uuid) : null;
      if (vu) ps.setString(3, vu); else ps.setObject(3, null);
      ps.setString(4, _gambitDbNormalizePlayerName(v.player_name, vu));
      if (v.voted_map_id === undefined || v.voted_map_id === null) ps.setObject(5, null);
      else ps.setInt(5, Math.floor(Number(v.voted_map_id) || 0));
      if (v.voted_mode_id === undefined || v.voted_mode_id === null) ps.setObject(6, null);
      else ps.setInt(6, Math.floor(Number(v.voted_mode_id) || 0));
      ps.setInt(7, v.was_random_vote ? 1 : 0);
      var votedAt = _gambitFormatUtcDateTime(v.voted_at_ms || Date.now());
      if (votedAt) ps.setString(8, votedAt); else ps.setObject(8, null);
      ps.addBatch();
    }
    ps.executeBatch();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert analytics votes: ' + e);
    return false;
  }
}

function gambitDbInsertAnalyticsKitUsage(analyticsMatchId, usages) {
  var conn = gambitDbGetConnection();
  if (!conn || analyticsMatchId < 0 || !usages || usages.length === 0) return false;

  try {
    var ps = conn.prepareStatement(
      'INSERT INTO gambit_match_kit_usage (analytics_match_id, player_uuid, player_name, kit_key, selected_at_utc, deselected_at_utc, active_seconds, is_initial_pick, selection_reason)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (var i = 0; i < usages.length; i++) {
      var u = usages[i] || {};
      ps.setLong(1, Number(analyticsMatchId));
      var uu = u.player_uuid ? String(u.player_uuid) : null;
      if (uu) ps.setString(2, uu); else ps.setObject(2, null);
      ps.setString(3, _gambitDbNormalizePlayerName(u.player_name, uu));
      ps.setString(4, String(u.kit_key || 'unknown').toLowerCase());
      var selectedAt = _gambitFormatUtcDateTime(u.selected_at_ms || null);
      var deselectedAt = _gambitFormatUtcDateTime(u.deselected_at_ms || null);
      if (selectedAt) ps.setString(5, selectedAt); else ps.setObject(5, null);
      if (deselectedAt) ps.setString(6, deselectedAt); else ps.setObject(6, null);
      ps.setInt(7, Math.max(0, Math.floor(Number(u.active_seconds) || 0)));
      ps.setInt(8, u.is_initial_pick ? 1 : 0);
      if (u.selection_reason) ps.setString(9, String(u.selection_reason)); else ps.setObject(9, null);
      ps.addBatch();
    }
    ps.executeBatch();
    ps.close();
    return true;
  } catch (e) {
    console.error('[Gambit DB] Failed to insert analytics kit usage: ' + e);
    return false;
  }
}

gambitDbLoadConfig();
