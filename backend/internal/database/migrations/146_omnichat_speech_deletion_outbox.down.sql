DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM omnichat_speech_deletion_queue) THEN
        RAISE EXCEPTION 'cannot roll back OmniChat speech deletion outbox while pending objects remain';
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_omnichat_speech_object_deletion ON omnichat_speech_audio;
DROP FUNCTION IF EXISTS enqueue_omnichat_speech_object_deletion();
DROP TABLE IF EXISTS omnichat_speech_deletion_queue;
