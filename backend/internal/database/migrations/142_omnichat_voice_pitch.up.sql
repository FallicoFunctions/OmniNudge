ALTER TABLE omnichat_persona_voices ADD COLUMN IF NOT EXISTS pitch REAL NOT NULL DEFAULT 1;
ALTER TABLE omnichat_persona_voices DROP CONSTRAINT IF EXISTS omnichat_persona_voices_pitch_check;
ALTER TABLE omnichat_persona_voices ADD CONSTRAINT omnichat_persona_voices_pitch_check CHECK (pitch BETWEEN 0.5 AND 2);
