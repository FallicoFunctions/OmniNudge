-- Rollback: Remove hub access requests table

DROP TABLE IF EXISTS public.hub_access_requests;
DROP SEQUENCE IF EXISTS public.hub_access_requests_id_seq;
