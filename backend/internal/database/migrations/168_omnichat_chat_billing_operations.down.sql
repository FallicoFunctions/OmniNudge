DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM omnichat_chat_billing_deliveries) THEN
        RAISE EXCEPTION 'cannot roll back chat billing linkage while delivered responses remain';
    END IF;
END;
$$;

DROP TABLE IF EXISTS omnichat_chat_billing_deliveries;
