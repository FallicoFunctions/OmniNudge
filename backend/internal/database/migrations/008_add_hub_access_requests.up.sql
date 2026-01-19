-- Migration: Add hub access requests table
-- This enables users to request access to private hubs

DROP TABLE IF EXISTS public.hub_access_requests;

CREATE TABLE public.hub_access_requests (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    user_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hub_access_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])))
);

CREATE SEQUENCE public.hub_access_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.hub_access_requests_id_seq OWNED BY public.hub_access_requests.id;

ALTER TABLE ONLY public.hub_access_requests ALTER COLUMN id SET DEFAULT nextval('public.hub_access_requests_id_seq'::regclass);

ALTER TABLE ONLY public.hub_access_requests
    ADD CONSTRAINT hub_access_requests_pkey PRIMARY KEY (id);

CREATE INDEX idx_hub_access_requests_hub_id ON public.hub_access_requests USING btree (hub_id);
CREATE INDEX idx_hub_access_requests_user_id ON public.hub_access_requests USING btree (user_id);
CREATE INDEX idx_hub_access_requests_status ON public.hub_access_requests USING btree (status);
CREATE INDEX idx_hub_access_requests_hub_user_status ON public.hub_access_requests USING btree (hub_id, user_id, status);

ALTER TABLE public.hub_access_requests ADD CONSTRAINT fk_hub_access_requests_hub FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;
ALTER TABLE public.hub_access_requests ADD CONSTRAINT fk_hub_access_requests_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
