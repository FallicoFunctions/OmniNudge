DROP TRIGGER IF EXISTS trg_folder_membership_limit ON public.conversation_folder_members;
DROP TRIGGER IF EXISTS trg_conversation_folder_limit ON public.conversation_folders;

DROP FUNCTION IF EXISTS public.enforce_folder_membership_limit();
DROP FUNCTION IF EXISTS public.enforce_conversation_folder_limit();

DROP INDEX IF EXISTS idx_conversation_folder_members_conversation;
DROP INDEX IF EXISTS idx_conversation_folder_members_folder;
DROP INDEX IF EXISTS idx_conversation_folders_user_position;

DROP TABLE IF EXISTS public.conversation_folder_members;
DROP TABLE IF EXISTS public.conversation_folders;
