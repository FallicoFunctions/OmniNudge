ALTER TABLE bot_personas
ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}';
