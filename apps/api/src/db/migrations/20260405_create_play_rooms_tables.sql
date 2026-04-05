CREATE TABLE IF NOT EXISTS play_rooms (
  id UUID PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  room_name TEXT NOT NULL,
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(12, 2) NOT NULL DEFAULT 0,
  alive_since TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE play_rooms
  ADD COLUMN IF NOT EXISTS room_name TEXT,
  ADD COLUMN IF NOT EXISTS state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_score NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alive_since TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE play_rooms
SET room_name = COALESCE(NULLIF(TRIM(room_name), ''), 'Room ' || room_code)
WHERE room_name IS NULL OR TRIM(room_name) = '';

ALTER TABLE play_rooms
  ALTER COLUMN room_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS play_rooms_last_activity_idx
  ON play_rooms (last_activity_at DESC);

CREATE TABLE IF NOT EXISTS play_room_memberships (
  room_id UUID NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_entered_at TIMESTAMP WITH TIME ZONE,
  last_left_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS play_room_memberships_user_idx
  ON play_room_memberships (user_id, last_entered_at DESC);

CREATE TABLE IF NOT EXISTS play_room_activities (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS play_room_activities_room_created_idx
  ON play_room_activities (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS play_room_task_completions (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_category TEXT NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_day DATE NOT NULL,
  completion_week_start DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS play_room_task_completions_room_week_idx
  ON play_room_task_completions (room_id, completion_week_start);

CREATE UNIQUE INDEX IF NOT EXISTS play_room_daily_completions_unique_idx
  ON play_room_task_completions (room_id, user_id, completion_day)
  WHERE task_category = 'daily';

CREATE UNIQUE INDEX IF NOT EXISTS play_room_weekly_completions_unique_idx
  ON play_room_task_completions (room_id, user_id, completion_week_start)
  WHERE task_category = 'weekly';

CREATE TABLE IF NOT EXISTS play_room_weekly_scores (
  room_id UUID NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  member_count INTEGER NOT NULL,
  daily_completion_count INTEGER NOT NULL,
  weekly_completion_count INTEGER NOT NULL,
  base_points NUMERIC(12, 2) NOT NULL,
  longevity_multiplier NUMERIC(8, 4) NOT NULL,
  awarded_points NUMERIC(12, 2) NOT NULL,
  weeks_alive INTEGER NOT NULL,
  scored_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, week_start)
);
