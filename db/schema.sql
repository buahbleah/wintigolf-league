-- Wintigolf League — Datenbankschema.
--
-- Einmal gegen eine frische Postgres-Datenbank laufen lassen:
--   npm run db:apply
--
-- Das Schema ist idempotent (CREATE TABLE IF NOT EXISTS), ein zweiter Lauf
-- richtet also keinen Schaden an.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------ Konten

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,              -- scrypt$<salt hex>$<key hex>
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  outdoor_handicap numeric(4,1),            -- selber eingetragen, reine Information
  avatar_url text,                          -- kleine Data-URL, auf dem Gerät verkleinert
  color_index int NOT NULL DEFAULT 0,
  club_distances jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Adressen werden überall klein verglichen.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,                   -- 32 zufällige Bytes, base64url
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- ---------------------------------------------------------- Einstellungen
-- Alles, was der Admin drehen kann, liegt als ein JSON-Dokument pro Saison in
-- seasons.settings. Hier liegen nur globale Dinge (Name der App, Liga-Regeln).

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- Saisons

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  join_code text NOT NULL UNIQUE,           -- 6 Zeichen, ohne Vokale und Verwechsler
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','playoffs','finished','archived')),
  -- Alle Stellschrauben. Was hier fehlt, gilt mit dem Standardwert aus dem Code.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,                   -- gesetzt, sobald die erste Runde startet
  paused_at timestamptz,                    -- Liga pausiert, Folgewochen rücken nach
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS season_players (
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Startwert der Saison: 50 % des Outdoor-Handicaps, bis zum Saisonstart
  -- änderbar, danach eingefroren.
  starting_handicap numeric(4,1),
  -- Das Handicap, auf das gerade gespielt wird. Ab Woche 4 vom System gerechnet.
  indoor_handicap numeric(4,1),
  joined_week int NOT NULL DEFAULT 1,       -- Nachzügler zählen erst ab hier
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

-- ---------------------------------------------------------------- Kurse

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  tee text NOT NULL,                        -- alle spielen dasselbe Tee
  par int NOT NULL,
  course_rating numeric(4,1) NOT NULL,
  slope_rating int NOT NULL,
  length_m int NOT NULL,                    -- muss in die erlaubte Spanne passen
  rating_source text NOT NULL DEFAULT 'gspro'
    CHECK (rating_source IN ('gspro','api','estimate')),
  external_ref text,                        -- Kurs-ID der GolfCourseAPI, wenn von dort
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Ein Kurs darf pro Saison nur einmal vorkommen.
CREATE UNIQUE INDEX IF NOT EXISTS courses_season_name_key
  ON courses (season_id, lower(name));

CREATE TABLE IF NOT EXISTS course_holes (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number BETWEEN 1 AND 18),
  par int NOT NULL CHECK (par BETWEEN 3 AND 6),
  stroke_index int NOT NULL CHECK (stroke_index BETWEEN 1 AND 18),
  length_m int,
  PRIMARY KEY (course_id, number)
);

-- ---------------------------------------------------------------- Wochen

CREATE TABLE IF NOT EXISTS weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  number int NOT NULL,                      -- 1..10, danach die Playoff-Wochen
  kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','playoff')),
  playoff_round text,                       -- 'quarter','semi','final','third'
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,             -- Deadline, Europe/Zurich
  picker_id uuid REFERENCES users(id) ON DELETE SET NULL,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, number)
);

-- --------------------------------------------------------------- Runden
-- Eine Runde ist Kopf plus 18 Lochzeilen. Punkte, Netto, Differential und
-- Matchplay-Resultat werden daraus gerechnet, nie separat gepflegt.

CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  -- Beim Start eingefroren: eine spätere Handicap-Änderung rechnet diese
  -- Runde nie um.
  handicap_index numeric(4,1) NOT NULL,
  playing_handicap int NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','confirmed','rejected')),
  marker_id uuid REFERENCES users(id) ON DELETE SET NULL,   -- der gewählte Zähler
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  rejected_reason text,
  solo_approved_by uuid REFERENCES users(id) ON DELETE SET NULL, -- Einzelrunde
  screenshot_url text,
  admin_note text,                          -- "vom Admin korrigiert"
  corrected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  played_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Ein Versuch pro Woche.
CREATE UNIQUE INDEX IF NOT EXISTS rounds_week_user_key ON rounds (week_id, user_id);
CREATE INDEX IF NOT EXISTS rounds_season_user_idx ON rounds (season_id, user_id);
CREATE INDEX IF NOT EXISTS rounds_marker_idx ON rounds (marker_id) WHERE status = 'submitted';

CREATE TABLE IF NOT EXISTS round_holes (
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number BETWEEN 1 AND 18),
  strokes int CHECK (strokes IS NULL OR strokes BETWEEN 1 AND 20),  -- NULL = 0 Punkte
  PRIMARY KEY (round_id, number)
);

-- ----------------------------------------------------- Handicap-Geschichte

CREATE TABLE IF NOT EXISTS handicap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id uuid REFERENCES rounds(id) ON DELETE SET NULL,
  before_value numeric(4,1),
  after_value numeric(4,1) NOT NULL,
  differential numeric(4,1),
  engine text,                              -- 'whs' | 'congu' | 'manual'
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handicap_events_user_idx ON handicap_events (season_id, user_id, created_at);

-- --------------------------------------------------------------- Termine

CREATE TABLE IF NOT EXISTS slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_id uuid REFERENCES weeks(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 120,    -- eine Stunde pro Person, mind. 2 h
  note text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS slots_starts_idx ON slots (season_id, starts_at);

CREATE TABLE IF NOT EXISTS slot_signups (
  slot_id uuid NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_id, user_id)
);

-- -------------------------------------------------------------- Clubhaus

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_id uuid REFERENCES weeks(id) ON DELETE SET NULL,  -- automatischer Wochen-Thread
  title text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_post_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid REFERENCES topics(id) ON DELETE CASCADE,
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE,  -- Kommentar an einer Karte
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CHECK (topic_id IS NOT NULL OR round_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS posts_topic_idx ON posts (topic_id, created_at);
CREATE INDEX IF NOT EXISTS posts_round_idx ON posts (round_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  target_type text NOT NULL CHECK (target_type IN ('post','round')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, user_id, emoji)
);

-- -------------------------------------------------------- Benachrichtigungen

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Was schon per Mail rausging, damit ein zweiter Cron-Lauf nicht nochmals schickt.
CREATE TABLE IF NOT EXISTS mail_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  error text
);

-- ---------------------------------------------------------------- Badges

CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  round_id uuid REFERENCES rounds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS badges_user_idx ON badges (season_id, user_id);

-- -------------------------------------------------------------- Playoffs

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  round_name text NOT NULL,                 -- 'quarter','semi','final','third'
  slot int NOT NULL,                        -- Position im Bracket
  home_id uuid REFERENCES users(id) ON DELETE SET NULL,
  away_id uuid REFERENCES users(id) ON DELETE SET NULL,
  home_seed int,
  away_seed int,
  winner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  result text,                              -- '3&2', '1 auf', 'im Stechen'
  decided_by text CHECK (decided_by IN ('play','walkover','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, slot)
);

-- ------------------------------------------------------- Kurs-API-Cache
-- Das Gratiskontingent der GolfCourseAPI ist klein, darum wird jede Antwort
-- roh gespeichert und die Zahl der ausgehenden Anfragen pro Tag gedeckelt.

CREATE TABLE IF NOT EXISTS course_api_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_api_budget (
  day date PRIMARY KEY,
  calls int NOT NULL DEFAULT 0
);
