CREATE TABLE IF NOT EXISTS public.conversation_folders (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#3B82F6' NOT NULL,
    icon VARCHAR(16) DEFAULT '📁' NOT NULL,
    position INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_conversation_folders_user_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.conversation_folder_members (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    folder_id INTEGER NOT NULL REFERENCES public.conversation_folders(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_conversation_folder_members UNIQUE (folder_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_folders_user_position
    ON public.conversation_folders(user_id, position);

CREATE INDEX IF NOT EXISTS idx_conversation_folder_members_folder
    ON public.conversation_folder_members(folder_id);

CREATE INDEX IF NOT EXISTS idx_conversation_folder_members_conversation
    ON public.conversation_folder_members(conversation_id);

CREATE OR REPLACE FUNCTION public.enforce_conversation_folder_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(1)
        FROM public.conversation_folders
        WHERE user_id = NEW.user_id
    ) >= 50 THEN
        RAISE EXCEPTION 'folder limit exceeded (max 50 per user)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_folder_membership_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        SELECT COUNT(1)
        FROM public.conversation_folder_members
        WHERE folder_id = NEW.folder_id
    ) >= 1000 THEN
        RAISE EXCEPTION 'folder membership limit exceeded (max 1000 conversations per folder)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_folder_limit ON public.conversation_folders;
CREATE TRIGGER trg_conversation_folder_limit
BEFORE INSERT ON public.conversation_folders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_conversation_folder_limit();

DROP TRIGGER IF EXISTS trg_folder_membership_limit ON public.conversation_folder_members;
CREATE TRIGGER trg_folder_membership_limit
BEFORE INSERT ON public.conversation_folder_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_folder_membership_limit();
