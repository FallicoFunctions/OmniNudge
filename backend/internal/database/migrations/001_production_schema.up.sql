-- OmniNudge Production Schema
-- Consolidated from 48 development migrations
-- Generated: 2026-01-13
-- This represents the final state of all features in Phase 1

--
-- PostgreSQL database dump
--

-- Dumped from database version 14.19 (Homebrew)
-- Dumped by pg_dump version 14.19 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: calculate_hot_score(integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.calculate_hot_score(ups integer, downs integer, created_at timestamp with time zone) RETURNS double precision
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    score INTEGER;
    sign_val DOUBLE PRECISION;
    order_val DOUBLE PRECISION;
    seconds DOUBLE PRECISION;
    epoch TIMESTAMP WITH TIME ZONE := '2005-12-08 07:46:43 UTC';
BEGIN
    score := ups - downs;

    -- Determine sign (-1, 0, or 1)
    IF score > 0 THEN
        sign_val := 1;
    ELSIF score < 0 THEN
        sign_val := -1;
    ELSE
        sign_val := 0;
    END IF;

    -- Logarithmic order (base 10)
    order_val := log(greatest(abs(score), 1));

    -- Seconds since epoch
    seconds := EXTRACT(EPOCH FROM (created_at - epoch));

    -- Final hot score formula
    RETURN order_val + sign_val * seconds / 45000.0;
END;
$$;


--
-- Name: record_comment_vote_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.record_comment_vote_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only record upvotes (downvotes don't trigger notifications)
    IF NEW.is_upvote = TRUE THEN
        INSERT INTO vote_activity (content_type, content_id, author_id, voter_id, is_upvote, hour_bucket)
        SELECT
            'comment',
            NEW.comment_id,
            c.user_id,
            NEW.user_id,
            TRUE,
            date_trunc('hour', CURRENT_TIMESTAMP)
        FROM post_comments c
        WHERE c.id = NEW.comment_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: record_post_vote_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.record_post_vote_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only record upvotes (downvotes don't trigger notifications)
    IF NEW.is_upvote = TRUE THEN
        INSERT INTO vote_activity (content_type, content_id, author_id, voter_id, is_upvote, hour_bucket)
        SELECT
            'post',
            NEW.post_id,
            p.author_id,
            NEW.user_id,
            TRUE,
            date_trunc('hour', CURRENT_TIMESTAMP)
        FROM platform_posts p
        WHERE p.id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_comment_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_comment_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
    RETURN NEW;
END;
$$;


--
-- Name: update_hot_score_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_hot_score_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.hot_score := calculate_hot_score(NEW.score, 0, NEW.created_at);
    RETURN NEW;
END;
$$;


--
-- Name: update_hub_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_hub_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$;


--
-- Name: update_post_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_post_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$;


--
-- Name: update_theme_install_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_theme_install_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Increment install count
    UPDATE user_themes
    SET
        install_count = install_count + 1,
        updated_at = NOW()
    WHERE id = NEW.theme_id;

    RETURN NEW;
END;
$$;


--
-- Name: update_theme_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_theme_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Recalculate average rating for the theme
    UPDATE user_themes
    SET
        rating_count = (
            SELECT COUNT(*)
            FROM user_installed_themes
            WHERE theme_id = NEW.theme_id AND user_rating IS NOT NULL
        ),
        average_rating = (
            SELECT COALESCE(AVG(user_rating), 0)
            FROM user_installed_themes
            WHERE theme_id = NEW.theme_id AND user_rating IS NOT NULL
        ),
        updated_at = NOW()
    WHERE id = NEW.theme_id;

    RETURN NEW;
END;
$$;


--
-- Name: update_user_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_user_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.username, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.bio, '')), 'B');
    RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: ban_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ban_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(50) NOT NULL,
    reason text NOT NULL,
    show_reason boolean DEFAULT false NOT NULL,
    admin_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ban_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ban_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ban_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ban_history_id_seq OWNED BY public.ban_history.id;


--
-- Name: blocked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_users (
    id integer NOT NULL,
    blocker_id integer NOT NULL,
    blocked_id integer NOT NULL,
    blocked_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cannot_block_self CHECK ((blocker_id <> blocked_id))
);


--
-- Name: blocked_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocked_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocked_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocked_users_id_seq OWNED BY public.blocked_users.id;


--
-- Name: bug_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bug_reports (
    id integer NOT NULL,
    user_id integer,
    page_url text NOT NULL,
    description text NOT NULL,
    screenshot_url text,
    status character varying(50) DEFAULT 'new'::character varying NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bug_reports_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'investigating'::character varying, 'fixed'::character varying, 'wont_fix'::character varying, 'duplicate'::character varying])::text[])))
);


--
-- Name: bug_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bug_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bug_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bug_reports_id_seq OWNED BY public.bug_reports.id;


--
-- Name: comment_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_votes (
    id integer NOT NULL,
    comment_id integer NOT NULL,
    user_id integer NOT NULL,
    is_upvote boolean NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: comment_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_votes_id_seq OWNED BY public.comment_votes.id;


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    user_id integer NOT NULL,
    is_moderator boolean DEFAULT false,
    joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_read_at timestamp with time zone
);


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_participants_id_seq OWNED BY public.conversation_participants.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    user1_id integer,
    user2_id integer,
    created_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    user1_auto_delete_after interval,
    user2_auto_delete_after interval,
    user1_pseudonym character varying(50),
    user2_pseudonym character varying(50),
    conversation_type character varying(20) DEFAULT 'dm'::character varying,
    hub_id integer,
    subject character varying(300),
    status character varying(20) DEFAULT 'open'::character varying,
    archived_at timestamp with time zone,
    archived_by integer,
    deleted_for_user1 boolean DEFAULT false,
    deleted_for_user2 boolean DEFAULT false,
    archived_for_user1 boolean DEFAULT false,
    archived_for_user2 boolean DEFAULT false,
    CONSTRAINT conversation_type_check CHECK (((conversation_type)::text = ANY ((ARRAY['dm'::character varying, 'mod_mail'::character varying])::text[]))),
    CONSTRAINT status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'archived'::character varying, 'resolved'::character varying])::text[])))
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: hidden_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hidden_posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    post_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hidden_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hidden_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hidden_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hidden_posts_id_seq OWNED BY public.hidden_posts.id;


--
-- Name: hidden_reddit_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hidden_reddit_posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subreddit character varying(100) NOT NULL,
    reddit_post_id character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hidden_reddit_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hidden_reddit_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hidden_reddit_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hidden_reddit_posts_id_seq OWNED BY public.hidden_reddit_posts.id;


--
-- Name: hub_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_bans (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    user_id integer NOT NULL,
    banned_by integer NOT NULL,
    reason text,
    note text,
    ban_type character varying(20) NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hub_bans_ban_type_check CHECK (((ban_type)::text = ANY ((ARRAY['permanent'::character varying, 'temporary'::character varying])::text[])))
);


--
-- Name: hub_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hub_bans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hub_bans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hub_bans_id_seq OWNED BY public.hub_bans.id;


--
-- Name: hub_moderators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_moderators (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying(20) DEFAULT 'moderator'::character varying NOT NULL,
    CONSTRAINT hub_moderator_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'full_moderator'::character varying, 'moderator'::character varying])::text[])))
);


--
-- Name: hub_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_settings (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    display_title character varying(300),
    sidebar_markdown text,
    privacy_type character varying(20) DEFAULT 'public'::character varying NOT NULL,
    allow_text_posts boolean DEFAULT true NOT NULL,
    allow_link_posts boolean DEFAULT true NOT NULL,
    allow_image_posts boolean DEFAULT true NOT NULL,
    allow_video_posts boolean DEFAULT true NOT NULL,
    allow_poll_posts boolean DEFAULT true NOT NULL,
    allow_media_in_comments boolean DEFAULT true NOT NULL,
    require_post_flair boolean DEFAULT false NOT NULL,
    banned_words text[],
    spam_filter_strength character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    new_account_filter_days integer DEFAULT 0,
    min_account_karma integer DEFAULT 0,
    access_request_cooldown_days integer DEFAULT 0,
    allow_spoilers boolean DEFAULT true NOT NULL,
    show_thumbnails boolean DEFAULT true NOT NULL,
    enable_wiki boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by integer,
    CONSTRAINT privacy_type_check CHECK (((privacy_type)::text = ANY ((ARRAY['public'::character varying, 'restricted'::character varying, 'private'::character varying])::text[]))),
    CONSTRAINT spam_filter_check CHECK (((spam_filter_strength)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])))
);


--
-- Name: hub_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hub_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hub_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hub_settings_id_seq OWNED BY public.hub_settings.id;


--
-- Name: hub_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    hub_id integer NOT NULL,
    subscribed_at timestamp with time zone DEFAULT now()
);


--
-- Name: hub_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hub_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hub_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hub_subscriptions_id_seq OWNED BY public.hub_subscriptions.id;


--
-- Name: hub_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hub_themes (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT false NOT NULL,
    css_content text,
    apply_to_whole_page boolean DEFAULT true NOT NULL,
    apply_to_header boolean DEFAULT false NOT NULL,
    apply_to_sidebar boolean DEFAULT false NOT NULL,
    apply_to_post_list boolean DEFAULT false NOT NULL,
    apply_to_post_detail boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    parent_version_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: hub_themes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hub_themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hub_themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hub_themes_id_seq OWNED BY public.hub_themes.id;


--
-- Name: hubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hubs (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector,
    title character varying(500),
    type character varying(20) DEFAULT 'public'::character varying,
    content_options character varying(20) DEFAULT 'any'::character varying,
    is_quarantined boolean DEFAULT false,
    subscriber_count integer DEFAULT 0,
    nsfw boolean DEFAULT false NOT NULL,
    name_normalized character varying(50) NOT NULL,
    CONSTRAINT hubs_content_options_check CHECK (((content_options)::text = ANY ((ARRAY['any'::character varying, 'links_only'::character varying, 'text_only'::character varying, 'images_only'::character varying, 'videos_only'::character varying, 'custom'::character varying])::text[]))),
    CONSTRAINT hubs_type_check CHECK (((type)::text = ANY ((ARRAY['public'::character varying, 'private'::character varying])::text[])))
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id integer NOT NULL,
    inviter_id integer NOT NULL,
    invited_user_id integer,
    invitation_code character varying(50) NOT NULL,
    invitation_link text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone,
    reward_granted boolean DEFAULT false
);


--
-- Name: invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invitations_id_seq OWNED BY public.invitations.id;


--
-- Name: known_bugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.known_bugs (
    id integer NOT NULL,
    title character varying(500) NOT NULL,
    description text NOT NULL,
    status character varying(50) DEFAULT 'investigating'::character varying NOT NULL,
    severity character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    affected_pages text[],
    fixed_in_version character varying(50),
    workaround text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fixed_at timestamp with time zone,
    CONSTRAINT known_bugs_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT known_bugs_status_check CHECK (((status)::text = ANY ((ARRAY['investigating'::character varying, 'in_progress'::character varying, 'fixed'::character varying, 'wont_fix'::character varying])::text[])))
);


--
-- Name: known_bugs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.known_bugs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: known_bugs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.known_bugs_id_seq OWNED BY public.known_bugs.id;


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id integer NOT NULL,
    user_id integer NOT NULL,
    filename character varying(255) NOT NULL,
    original_filename character varying(255),
    file_type character varying(50) NOT NULL,
    file_size integer NOT NULL,
    storage_url text NOT NULL,
    thumbnail_url text,
    storage_path text,
    width integer,
    height integer,
    duration integer,
    uploaded_at timestamp with time zone DEFAULT now(),
    used_in_message_id integer,
    used_in_slideshow boolean DEFAULT false
);


--
-- Name: media_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_files_id_seq OWNED BY public.media_files.id;


--
-- Name: message_recipient_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_recipient_keys (
    id integer NOT NULL,
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    encrypted_key text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: message_recipient_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.message_recipient_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_recipient_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.message_recipient_keys_id_seq OWNED BY public.message_recipient_keys.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    recipient_id integer NOT NULL,
    encrypted_content text NOT NULL,
    message_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    encryption_version character varying(10) DEFAULT 'v1'::character varying,
    media_url text,
    media_type character varying(128),
    media_size integer,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    deleted_for_sender boolean DEFAULT false,
    deleted_for_recipient boolean DEFAULT false,
    media_file_id integer,
    media_encryption_key text,
    media_encryption_iv text,
    sender_encrypted_content text,
    sender_media_encryption_key text,
    is_multi_recipient boolean DEFAULT false,
    shared_encryption_iv text
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: mod_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_logs (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    moderator_id integer NOT NULL,
    action character varying(50) NOT NULL,
    target_type character varying(20),
    target_id integer,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mod_logs_action_check CHECK (((action)::text = ANY ((ARRAY['ban_user'::character varying, 'unban_user'::character varying, 'remove_post'::character varying, 'approve_post'::character varying, 'remove_comment'::character varying, 'approve_comment'::character varying, 'lock_post'::character varying, 'unlock_post'::character varying, 'pin_post'::character varying, 'unpin_post'::character varying, 'add_moderator'::character varying, 'remove_moderator'::character varying, 'update_removal_reason'::character varying, 'create_removal_reason'::character varying, 'delete_removal_reason'::character varying])::text[])))
);


--
-- Name: mod_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_logs_id_seq OWNED BY public.mod_logs.id;


--
-- Name: removed_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.removed_content (
    id integer NOT NULL,
    content_type character varying(20) NOT NULL,
    content_id integer NOT NULL,
    hub_id integer,
    removed_by integer NOT NULL,
    removal_reason_id integer,
    custom_reason text,
    mod_note text,
    removed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT removed_content_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['post'::character varying, 'comment'::character varying])::text[])))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    reporter_id integer NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id integer NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mod_queue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.mod_queue AS
 SELECT 'report'::text AS queue_type,
    r.id AS queue_id,
    r.target_type,
    r.target_id,
    r.reason AS content,
    r.status,
    r.created_at,
    NULL::integer AS hub_id,
    r.reporter_id AS actor_id,
    NULL::text AS mod_note
   FROM public.reports r
  WHERE ((r.status)::text = 'open'::text)
UNION ALL
 SELECT 'removed_content'::text AS queue_type,
    rc.id AS queue_id,
    rc.content_type AS target_type,
    rc.content_id AS target_id,
    rc.custom_reason AS content,
    'reviewed'::character varying AS status,
    rc.removed_at AS created_at,
    rc.hub_id,
    rc.removed_by AS actor_id,
    rc.mod_note
   FROM public.removed_content rc;


--
-- Name: notification_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_batches (
    id integer NOT NULL,
    user_id integer NOT NULL,
    content_type character varying(20) NOT NULL,
    content_id integer NOT NULL,
    notification_type character varying(50) NOT NULL,
    votes_per_hour integer,
    milestone_count integer,
    scheduled_for timestamp with time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone
);


--
-- Name: notification_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_batches_id_seq OWNED BY public.notification_batches.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    notification_type character varying(50) NOT NULL,
    content_type character varying(20),
    content_id integer,
    actor_id integer,
    milestone_count integer,
    votes_per_hour integer,
    message text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: platform_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_posts (
    id integer NOT NULL,
    author_id integer NOT NULL,
    title character varying(300) NOT NULL,
    body text,
    tags text[],
    media_url text,
    media_type character varying(20),
    thumbnail_url text,
    score integer DEFAULT 0,
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    num_comments integer DEFAULT 0,
    view_count integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    is_edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    hub_id integer,
    search_vector tsvector,
    crosspost_origin_type character varying(20),
    crosspost_origin_subreddit character varying(100),
    crosspost_origin_post_id character varying(50),
    crosspost_original_title character varying(300),
    target_subreddit text,
    crossposted_at timestamp with time zone,
    hot_score double precision DEFAULT 0,
    nsfw boolean DEFAULT false NOT NULL,
    is_removed boolean DEFAULT false NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    removed_at timestamp with time zone,
    removed_by integer,
    gallery_images jsonb,
    CONSTRAINT title_length CHECK (((char_length((title)::text) >= 1) AND (char_length((title)::text) <= 300)))
);


--
-- Name: platform_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_posts_id_seq OWNED BY public.platform_posts.id;


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    parent_comment_id integer,
    body text NOT NULL,
    score integer DEFAULT 0,
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    is_edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    depth integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    search_vector tsvector,
    inbox_replies_disabled boolean DEFAULT false NOT NULL,
    is_removed boolean DEFAULT false NOT NULL,
    removed_at timestamp with time zone,
    removed_by integer,
    CONSTRAINT body_not_empty CHECK ((char_length(body) >= 1))
);


--
-- Name: post_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_comments_id_seq OWNED BY public.post_comments.id;


--
-- Name: post_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_votes (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    is_upvote boolean NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: post_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_votes_id_seq OWNED BY public.post_votes.id;


--
-- Name: reddit_comment_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reddit_comment_votes (
    id integer NOT NULL,
    comment_id integer NOT NULL,
    user_id integer NOT NULL,
    vote_type integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT reddit_comment_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['-1'::integer, 1])))
);


--
-- Name: reddit_comment_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reddit_comment_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reddit_comment_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reddit_comment_votes_id_seq OWNED BY public.reddit_comment_votes.id;


--
-- Name: reddit_post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reddit_post_comments (
    id integer NOT NULL,
    subreddit character varying(255) NOT NULL,
    reddit_post_id character varying(255) NOT NULL,
    reddit_post_title text,
    user_id integer NOT NULL,
    parent_comment_id integer,
    content text NOT NULL,
    score integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    inbox_replies_disabled boolean DEFAULT false NOT NULL,
    parent_reddit_comment_id character varying(255)
);


--
-- Name: reddit_post_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reddit_post_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reddit_post_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reddit_post_comments_id_seq OWNED BY public.reddit_post_comments.id;


--
-- Name: reddit_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reddit_posts (
    id integer NOT NULL,
    reddit_post_id character varying(50) NOT NULL,
    subreddit character varying(50) NOT NULL,
    title text NOT NULL,
    author character varying(50),
    body text,
    url text,
    thumbnail_url text,
    media_type character varying(20),
    media_url text,
    score integer DEFAULT 0,
    num_comments integer DEFAULT 0,
    created_utc timestamp with time zone,
    cache_key character varying(255) NOT NULL,
    cached_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: reddit_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reddit_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reddit_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reddit_posts_id_seq OWNED BY public.reddit_posts.id;


--
-- Name: removal_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.removal_reasons (
    id integer NOT NULL,
    hub_id integer NOT NULL,
    title character varying(100) NOT NULL,
    message text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: removal_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.removal_reasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: removal_reasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.removal_reasons_id_seq OWNED BY public.removal_reasons.id;


--
-- Name: removed_content_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.removed_content_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: removed_content_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.removed_content_id_seq OWNED BY public.removed_content.id;


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: saved_post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_post_comments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    comment_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_post_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_post_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_post_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_post_comments_id_seq OWNED BY public.saved_post_comments.id;


--
-- Name: saved_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    post_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_posts_id_seq OWNED BY public.saved_posts.id;


--
-- Name: saved_reddit_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_reddit_comments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    comment_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_reddit_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_reddit_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_reddit_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_reddit_comments_id_seq OWNED BY public.saved_reddit_comments.id;


--
-- Name: saved_reddit_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_reddit_posts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subreddit character varying(100) NOT NULL,
    reddit_post_id character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title character varying(300),
    author character varying(100),
    score integer DEFAULT 0,
    num_comments integer DEFAULT 0,
    thumbnail text,
    created_utc integer
);


--
-- Name: saved_reddit_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_reddit_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_reddit_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_reddit_posts_id_seq OWNED BY public.saved_reddit_posts.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

-- CREATE TABLE public.schema_migrations (
--     version character varying(255) NOT NULL,
--     applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
-- );


--
-- Name: slideshow_media_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slideshow_media_items (
    id integer NOT NULL,
    slideshow_session_id integer NOT NULL,
    media_file_id integer NOT NULL,
    "position" integer NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: slideshow_media_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.slideshow_media_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: slideshow_media_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.slideshow_media_items_id_seq OWNED BY public.slideshow_media_items.id;


--
-- Name: slideshow_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slideshow_sessions (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    slideshow_type character varying(20) NOT NULL,
    subreddit character varying(100),
    reddit_sort character varying(20) DEFAULT 'hot'::character varying,
    current_index integer DEFAULT 0 NOT NULL,
    total_items integer DEFAULT 0 NOT NULL,
    controller_user_id integer NOT NULL,
    auto_advance boolean DEFAULT false,
    auto_advance_interval integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT slideshow_sessions_slideshow_type_check CHECK (((slideshow_type)::text = ANY ((ARRAY['personal'::character varying, 'reddit'::character varying])::text[])))
);


--
-- Name: slideshow_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.slideshow_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: slideshow_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.slideshow_sessions_id_seq OWNED BY public.slideshow_sessions.id;


--
-- Name: subreddit_moderators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subreddit_moderators_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subreddit_moderators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subreddit_moderators_id_seq OWNED BY public.hub_moderators.id;


--
-- Name: subreddit_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subreddit_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    subreddit_name character varying(100) NOT NULL,
    subscribed_at timestamp with time zone DEFAULT now()
);


--
-- Name: subreddit_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subreddit_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subreddit_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subreddit_subscriptions_id_seq OWNED BY public.subreddit_subscriptions.id;


--
-- Name: subreddits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subreddits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subreddits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subreddits_id_seq OWNED BY public.hubs.id;


--
-- Name: user_activity_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_baselines (
    user_id integer NOT NULL,
    avg_post_votes_per_hour numeric(10,2) DEFAULT 0,
    avg_comment_votes_per_hour numeric(10,2) DEFAULT 0,
    total_posts integer DEFAULT 0,
    total_comments integer DEFAULT 0,
    last_calculated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_installed_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_installed_themes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    theme_id integer NOT NULL,
    purchased_at timestamp without time zone DEFAULT now() NOT NULL,
    price_paid integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    installed_version character varying(20),
    update_available boolean DEFAULT false NOT NULL,
    auto_update_enabled boolean DEFAULT false NOT NULL,
    user_rating integer,
    review text,
    reviewed_at timestamp without time zone
);


--
-- Name: user_installed_themes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_installed_themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_installed_themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_installed_themes_id_seq OWNED BY public.user_installed_themes.id;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id integer NOT NULL,
    notification_sound boolean DEFAULT true,
    show_read_receipts boolean DEFAULT true,
    show_typing_indicators boolean DEFAULT true,
    theme character varying(20) DEFAULT 'dark'::character varying,
    default_auto_delete_after interval,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notify_comment_replies boolean DEFAULT true,
    notify_post_milestone boolean DEFAULT true,
    notify_post_velocity boolean DEFAULT true,
    notify_comment_milestone boolean DEFAULT true,
    notify_comment_velocity boolean DEFAULT true,
    daily_digest boolean DEFAULT false,
    auto_append_invitation boolean DEFAULT false NOT NULL,
    media_gallery_filter character varying(10) DEFAULT 'all'::character varying,
    active_theme_id integer,
    advanced_mode_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT user_settings_media_gallery_filter_check CHECK (((media_gallery_filter)::text = ANY ((ARRAY['all'::character varying, 'mine'::character varying, 'theirs'::character varying])::text[])))
);


--
-- Name: user_theme_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_theme_overrides (
    id integer NOT NULL,
    user_id integer NOT NULL,
    page_name character varying(50) NOT NULL,
    theme_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: user_theme_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_theme_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_theme_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_theme_overrides_id_seq OWNED BY public.user_theme_overrides.id;


--
-- Name: user_themes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_themes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    theme_name character varying(100) NOT NULL,
    theme_description text,
    theme_type character varying(50) DEFAULT 'variable_customization'::character varying NOT NULL,
    scope_type character varying(20) DEFAULT 'global'::character varying NOT NULL,
    target_page character varying(50),
    css_variables jsonb,
    custom_css text,
    is_public boolean DEFAULT false NOT NULL,
    is_marketplace boolean DEFAULT false NOT NULL,
    price_coins integer DEFAULT 0,
    category character varying(50),
    tags text[],
    thumbnail_url character varying(500),
    install_count integer DEFAULT 0 NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    average_rating numeric(3,2) DEFAULT 0,
    version character varying(20) DEFAULT '1.0.0'::character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_content CHECK (((((theme_type)::text = ANY ((ARRAY['predefined'::character varying, 'variable_customization'::character varying])::text[])) AND (css_variables IS NOT NULL)) OR (((theme_type)::text = 'full_css'::text) AND (custom_css IS NOT NULL)))),
    CONSTRAINT chk_scope_target CHECK (((((scope_type)::text = 'global'::text) AND (target_page IS NULL)) OR (((scope_type)::text = 'per_page'::text) AND (target_page IS NOT NULL))))
);


--
-- Name: user_themes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_themes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_themes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_themes_id_seq OWNED BY public.user_themes.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(512),
    password_hash character varying(255) NOT NULL,
    reddit_id character varying(50),
    reddit_username character varying(50),
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    public_key text,
    avatar_url text,
    bio text,
    karma integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    last_seen timestamp with time zone DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    search_vector tsvector,
    nsfw boolean DEFAULT false NOT NULL,
    email_encrypted boolean DEFAULT false,
    username_normalized character varying(50) NOT NULL,
    shadow_banned boolean DEFAULT false NOT NULL,
    banned boolean DEFAULT false NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    ban_reason text,
    show_ban_reason boolean DEFAULT false NOT NULL,
    banned_at timestamp without time zone,
    banned_by integer,
    last_agent_post_at timestamp without time zone,
    last_agent_browse_at timestamp without time zone,
    encrypted_private_key text,
    CONSTRAINT username_length CHECK (((char_length((username)::text) >= 3) AND (char_length((username)::text) <= 50)))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vote_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_activity (
    id integer NOT NULL,
    content_type character varying(20) NOT NULL,
    content_id integer NOT NULL,
    author_id integer NOT NULL,
    voter_id integer NOT NULL,
    is_upvote boolean NOT NULL,
    hour_bucket timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vote_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vote_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vote_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vote_activity_id_seq OWNED BY public.vote_activity.id;


--
-- Name: ban_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ban_history ALTER COLUMN id SET DEFAULT nextval('public.ban_history_id_seq'::regclass);


--
-- Name: blocked_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users ALTER COLUMN id SET DEFAULT nextval('public.blocked_users_id_seq'::regclass);


--
-- Name: bug_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports ALTER COLUMN id SET DEFAULT nextval('public.bug_reports_id_seq'::regclass);


--
-- Name: comment_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_votes ALTER COLUMN id SET DEFAULT nextval('public.comment_votes_id_seq'::regclass);


--
-- Name: conversation_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants ALTER COLUMN id SET DEFAULT nextval('public.conversation_participants_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: hidden_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_posts ALTER COLUMN id SET DEFAULT nextval('public.hidden_posts_id_seq'::regclass);


--
-- Name: hidden_reddit_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_reddit_posts ALTER COLUMN id SET DEFAULT nextval('public.hidden_reddit_posts_id_seq'::regclass);


--
-- Name: hub_bans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans ALTER COLUMN id SET DEFAULT nextval('public.hub_bans_id_seq'::regclass);


--
-- Name: hub_moderators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_moderators ALTER COLUMN id SET DEFAULT nextval('public.subreddit_moderators_id_seq'::regclass);


--
-- Name: hub_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_settings ALTER COLUMN id SET DEFAULT nextval('public.hub_settings_id_seq'::regclass);


--
-- Name: hub_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.hub_subscriptions_id_seq'::regclass);


--
-- Name: hub_themes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_themes ALTER COLUMN id SET DEFAULT nextval('public.hub_themes_id_seq'::regclass);


--
-- Name: hubs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubs ALTER COLUMN id SET DEFAULT nextval('public.subreddits_id_seq'::regclass);


--
-- Name: invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations ALTER COLUMN id SET DEFAULT nextval('public.invitations_id_seq'::regclass);


--
-- Name: known_bugs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.known_bugs ALTER COLUMN id SET DEFAULT nextval('public.known_bugs_id_seq'::regclass);


--
-- Name: media_files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files ALTER COLUMN id SET DEFAULT nextval('public.media_files_id_seq'::regclass);


--
-- Name: message_recipient_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipient_keys ALTER COLUMN id SET DEFAULT nextval('public.message_recipient_keys_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: mod_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_logs ALTER COLUMN id SET DEFAULT nextval('public.mod_logs_id_seq'::regclass);


--
-- Name: notification_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_batches ALTER COLUMN id SET DEFAULT nextval('public.notification_batches_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: platform_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_posts ALTER COLUMN id SET DEFAULT nextval('public.platform_posts_id_seq'::regclass);


--
-- Name: post_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments ALTER COLUMN id SET DEFAULT nextval('public.post_comments_id_seq'::regclass);


--
-- Name: post_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes ALTER COLUMN id SET DEFAULT nextval('public.post_votes_id_seq'::regclass);


--
-- Name: reddit_comment_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_comment_votes ALTER COLUMN id SET DEFAULT nextval('public.reddit_comment_votes_id_seq'::regclass);


--
-- Name: reddit_post_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_post_comments ALTER COLUMN id SET DEFAULT nextval('public.reddit_post_comments_id_seq'::regclass);


--
-- Name: reddit_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_posts ALTER COLUMN id SET DEFAULT nextval('public.reddit_posts_id_seq'::regclass);


--
-- Name: removal_reasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removal_reasons ALTER COLUMN id SET DEFAULT nextval('public.removal_reasons_id_seq'::regclass);


--
-- Name: removed_content id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content ALTER COLUMN id SET DEFAULT nextval('public.removed_content_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: saved_post_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_post_comments ALTER COLUMN id SET DEFAULT nextval('public.saved_post_comments_id_seq'::regclass);


--
-- Name: saved_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts ALTER COLUMN id SET DEFAULT nextval('public.saved_posts_id_seq'::regclass);


--
-- Name: saved_reddit_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_comments ALTER COLUMN id SET DEFAULT nextval('public.saved_reddit_comments_id_seq'::regclass);


--
-- Name: saved_reddit_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_posts ALTER COLUMN id SET DEFAULT nextval('public.saved_reddit_posts_id_seq'::regclass);


--
-- Name: slideshow_media_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_media_items ALTER COLUMN id SET DEFAULT nextval('public.slideshow_media_items_id_seq'::regclass);


--
-- Name: slideshow_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_sessions ALTER COLUMN id SET DEFAULT nextval('public.slideshow_sessions_id_seq'::regclass);


--
-- Name: subreddit_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subreddit_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subreddit_subscriptions_id_seq'::regclass);


--
-- Name: user_installed_themes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_installed_themes ALTER COLUMN id SET DEFAULT nextval('public.user_installed_themes_id_seq'::regclass);


--
-- Name: user_theme_overrides id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_theme_overrides ALTER COLUMN id SET DEFAULT nextval('public.user_theme_overrides_id_seq'::regclass);


--
-- Name: user_themes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_themes ALTER COLUMN id SET DEFAULT nextval('public.user_themes_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vote_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_activity ALTER COLUMN id SET DEFAULT nextval('public.vote_activity_id_seq'::regclass);


--
-- Name: ban_history ban_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ban_history
    ADD CONSTRAINT ban_history_pkey PRIMARY KEY (id);


--
-- Name: blocked_users blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (id);


--
-- Name: bug_reports bug_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);


--
-- Name: comment_votes comment_votes_comment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_comment_id_user_id_key UNIQUE (comment_id, user_id);


--
-- Name: comment_votes comment_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: hidden_posts hidden_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_posts
    ADD CONSTRAINT hidden_posts_pkey PRIMARY KEY (id);


--
-- Name: hidden_posts hidden_posts_user_id_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_posts
    ADD CONSTRAINT hidden_posts_user_id_post_id_key UNIQUE (user_id, post_id);


--
-- Name: hidden_reddit_posts hidden_reddit_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_reddit_posts
    ADD CONSTRAINT hidden_reddit_posts_pkey PRIMARY KEY (id);


--
-- Name: hidden_reddit_posts hidden_reddit_posts_user_id_subreddit_reddit_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_reddit_posts
    ADD CONSTRAINT hidden_reddit_posts_user_id_subreddit_reddit_post_id_key UNIQUE (user_id, subreddit, reddit_post_id);


--
-- Name: hub_bans hub_bans_hub_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans
    ADD CONSTRAINT hub_bans_hub_id_user_id_key UNIQUE (hub_id, user_id);


--
-- Name: hub_bans hub_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans
    ADD CONSTRAINT hub_bans_pkey PRIMARY KEY (id);


--
-- Name: hub_settings hub_settings_hub_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_settings
    ADD CONSTRAINT hub_settings_hub_id_key UNIQUE (hub_id);


--
-- Name: hub_settings hub_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_settings
    ADD CONSTRAINT hub_settings_pkey PRIMARY KEY (id);


--
-- Name: hub_subscriptions hub_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_subscriptions
    ADD CONSTRAINT hub_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: hub_subscriptions hub_subscriptions_user_id_hub_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_subscriptions
    ADD CONSTRAINT hub_subscriptions_user_id_hub_id_key UNIQUE (user_id, hub_id);


--
-- Name: hub_themes hub_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_themes
    ADD CONSTRAINT hub_themes_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_invitation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invitation_code_key UNIQUE (invitation_code);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: known_bugs known_bugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.known_bugs
    ADD CONSTRAINT known_bugs_pkey PRIMARY KEY (id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: message_recipient_keys message_recipient_keys_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipient_keys
    ADD CONSTRAINT message_recipient_keys_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_recipient_keys message_recipient_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipient_keys
    ADD CONSTRAINT message_recipient_keys_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mod_logs mod_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_logs
    ADD CONSTRAINT mod_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_batches notification_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_batches
    ADD CONSTRAINT notification_batches_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: platform_posts platform_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_posts
    ADD CONSTRAINT platform_posts_pkey PRIMARY KEY (id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_votes post_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_pkey PRIMARY KEY (id);


--
-- Name: post_votes post_votes_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_post_id_user_id_key UNIQUE (post_id, user_id);


--
-- Name: reddit_comment_votes reddit_comment_votes_comment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_comment_votes
    ADD CONSTRAINT reddit_comment_votes_comment_id_user_id_key UNIQUE (comment_id, user_id);


--
-- Name: reddit_comment_votes reddit_comment_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_comment_votes
    ADD CONSTRAINT reddit_comment_votes_pkey PRIMARY KEY (id);


--
-- Name: reddit_post_comments reddit_post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_post_comments
    ADD CONSTRAINT reddit_post_comments_pkey PRIMARY KEY (id);


--
-- Name: reddit_posts reddit_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_posts
    ADD CONSTRAINT reddit_posts_pkey PRIMARY KEY (id);


--
-- Name: reddit_posts reddit_posts_reddit_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_posts
    ADD CONSTRAINT reddit_posts_reddit_post_id_key UNIQUE (reddit_post_id);


--
-- Name: removal_reasons removal_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removal_reasons
    ADD CONSTRAINT removal_reasons_pkey PRIMARY KEY (id);


--
-- Name: removed_content removed_content_content_type_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content
    ADD CONSTRAINT removed_content_content_type_content_id_key UNIQUE (content_type, content_id);


--
-- Name: removed_content removed_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content
    ADD CONSTRAINT removed_content_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: saved_post_comments saved_post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_post_comments
    ADD CONSTRAINT saved_post_comments_pkey PRIMARY KEY (id);


--
-- Name: saved_post_comments saved_post_comments_user_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_post_comments
    ADD CONSTRAINT saved_post_comments_user_id_comment_id_key UNIQUE (user_id, comment_id);


--
-- Name: saved_posts saved_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_pkey PRIMARY KEY (id);


--
-- Name: saved_posts saved_posts_user_id_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_user_id_post_id_key UNIQUE (user_id, post_id);


--
-- Name: saved_reddit_comments saved_reddit_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_comments
    ADD CONSTRAINT saved_reddit_comments_pkey PRIMARY KEY (id);


--
-- Name: saved_reddit_comments saved_reddit_comments_user_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_comments
    ADD CONSTRAINT saved_reddit_comments_user_id_comment_id_key UNIQUE (user_id, comment_id);


--
-- Name: saved_reddit_posts saved_reddit_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_posts
    ADD CONSTRAINT saved_reddit_posts_pkey PRIMARY KEY (id);


--
-- Name: saved_reddit_posts saved_reddit_posts_user_id_subreddit_reddit_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_posts
    ADD CONSTRAINT saved_reddit_posts_user_id_subreddit_reddit_post_id_key UNIQUE (user_id, subreddit, reddit_post_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

-- ALTER TABLE ONLY public.schema_migrations
--     ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: slideshow_media_items slideshow_media_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_media_items
    ADD CONSTRAINT slideshow_media_items_pkey PRIMARY KEY (id);


--
-- Name: slideshow_sessions slideshow_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_sessions
    ADD CONSTRAINT slideshow_sessions_pkey PRIMARY KEY (id);


--
-- Name: hub_moderators subreddit_moderators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_moderators
    ADD CONSTRAINT subreddit_moderators_pkey PRIMARY KEY (id);


--
-- Name: hub_moderators subreddit_moderators_subreddit_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_moderators
    ADD CONSTRAINT subreddit_moderators_subreddit_id_user_id_key UNIQUE (hub_id, user_id);


--
-- Name: subreddit_subscriptions subreddit_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subreddit_subscriptions
    ADD CONSTRAINT subreddit_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subreddit_subscriptions subreddit_subscriptions_user_id_subreddit_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subreddit_subscriptions
    ADD CONSTRAINT subreddit_subscriptions_user_id_subreddit_name_key UNIQUE (user_id, subreddit_name);


--
-- Name: hubs subreddits_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubs
    ADD CONSTRAINT subreddits_name_key UNIQUE (name);


--
-- Name: hubs subreddits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubs
    ADD CONSTRAINT subreddits_pkey PRIMARY KEY (id);


--
-- Name: slideshow_sessions unique_active_slideshow; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_sessions
    ADD CONSTRAINT unique_active_slideshow UNIQUE (conversation_id);


--
-- Name: blocked_users unique_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id);


--
-- Name: conversations unique_conversation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT unique_conversation UNIQUE (user1_id, user2_id);


--
-- Name: notifications unique_milestone_notification; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT unique_milestone_notification UNIQUE (user_id, content_type, content_id, notification_type, milestone_count);


--
-- Name: conversation_participants unique_participant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT unique_participant UNIQUE (conversation_id, user_id);


--
-- Name: slideshow_media_items unique_position; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_media_items
    ADD CONSTRAINT unique_position UNIQUE (slideshow_session_id, "position");


--
-- Name: user_activity_baselines user_activity_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_baselines
    ADD CONSTRAINT user_activity_baselines_pkey PRIMARY KEY (user_id);


--
-- Name: user_installed_themes user_installed_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_installed_themes
    ADD CONSTRAINT user_installed_themes_pkey PRIMARY KEY (id);


--
-- Name: user_installed_themes user_installed_themes_user_id_theme_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_installed_themes
    ADD CONSTRAINT user_installed_themes_user_id_theme_id_key UNIQUE (user_id, theme_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: user_theme_overrides user_theme_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_theme_overrides
    ADD CONSTRAINT user_theme_overrides_pkey PRIMARY KEY (id);


--
-- Name: user_theme_overrides user_theme_overrides_user_id_page_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_theme_overrides
    ADD CONSTRAINT user_theme_overrides_user_id_page_name_key UNIQUE (user_id, page_name);


--
-- Name: user_themes user_themes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_themes
    ADD CONSTRAINT user_themes_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_reddit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_reddit_id_key UNIQUE (reddit_id);


--
-- Name: vote_activity vote_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_activity
    ADD CONSTRAINT vote_activity_pkey PRIMARY KEY (id);


--
-- Name: idx_ban_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ban_history_created_at ON public.ban_history USING btree (created_at DESC);


--
-- Name: idx_ban_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ban_history_user_id ON public.ban_history USING btree (user_id);


--
-- Name: idx_baselines_calculated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_baselines_calculated ON public.user_activity_baselines USING btree (last_calculated_at);


--
-- Name: idx_blocked_users_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_users_blocked ON public.blocked_users USING btree (blocked_id);


--
-- Name: idx_blocked_users_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocked_users_blocker ON public.blocked_users USING btree (blocker_id);


--
-- Name: idx_bug_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_created_at ON public.bug_reports USING btree (created_at DESC);


--
-- Name: idx_bug_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_status ON public.bug_reports USING btree (status);


--
-- Name: idx_bug_reports_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_user_id ON public.bug_reports USING btree (user_id);


--
-- Name: idx_comment_votes_comment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_votes_comment ON public.comment_votes USING btree (comment_id);


--
-- Name: idx_comment_votes_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_votes_composite ON public.comment_votes USING btree (user_id, comment_id, is_upvote);


--
-- Name: idx_comment_votes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_votes_user ON public.comment_votes USING btree (user_id);


--
-- Name: idx_comments_removed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_removed ON public.post_comments USING btree (is_removed);


--
-- Name: idx_conversation_participants_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_conv ON public.conversation_participants USING btree (conversation_id);


--
-- Name: idx_conversation_participants_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_unread ON public.conversation_participants USING btree (user_id, last_read_at);


--
-- Name: idx_conversation_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_participants_user ON public.conversation_participants USING btree (user_id);


--
-- Name: idx_conversations_archived_user1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_archived_user1 ON public.conversations USING btree (user1_id, archived_for_user1) WHERE ((archived_for_user1 = false) AND ((conversation_type)::text = 'dm'::text));


--
-- Name: idx_conversations_archived_user2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_archived_user2 ON public.conversations USING btree (user2_id, archived_for_user2) WHERE ((archived_for_user2 = false) AND ((conversation_type)::text = 'dm'::text));


--
-- Name: idx_conversations_deleted_user1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_deleted_user1 ON public.conversations USING btree (user1_id, deleted_for_user1) WHERE (deleted_for_user1 = false);


--
-- Name: idx_conversations_deleted_user2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_deleted_user2 ON public.conversations USING btree (user2_id, deleted_for_user2) WHERE (deleted_for_user2 = false);


--
-- Name: idx_conversations_hub_modmail; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_hub_modmail ON public.conversations USING btree (hub_id, conversation_type, last_message_at DESC) WHERE ((conversation_type)::text = 'mod_mail'::text);


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message ON public.conversations USING btree (last_message_at DESC);


--
-- Name: idx_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_status ON public.conversations USING btree (hub_id, status, last_message_at DESC) WHERE ((conversation_type)::text = 'mod_mail'::text);


--
-- Name: idx_conversations_user1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user1 ON public.conversations USING btree (user1_id);


--
-- Name: idx_conversations_user2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user2 ON public.conversations USING btree (user2_id);


--
-- Name: idx_hidden_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hidden_posts_user ON public.hidden_posts USING btree (user_id);


--
-- Name: idx_hidden_reddit_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hidden_reddit_posts_user ON public.hidden_reddit_posts USING btree (user_id);


--
-- Name: idx_hub_bans_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_bans_expires ON public.hub_bans USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_hub_bans_hub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_bans_hub ON public.hub_bans USING btree (hub_id);


--
-- Name: idx_hub_bans_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_bans_user ON public.hub_bans USING btree (user_id);


--
-- Name: idx_hub_settings_hub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_settings_hub_id ON public.hub_settings USING btree (hub_id);


--
-- Name: idx_hub_subscriptions_hub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_subscriptions_hub_id ON public.hub_subscriptions USING btree (hub_id);


--
-- Name: idx_hub_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_subscriptions_user_id ON public.hub_subscriptions USING btree (user_id);


--
-- Name: idx_hub_themes_hub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hub_themes_hub_id ON public.hub_themes USING btree (hub_id);


--
-- Name: idx_hub_themes_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_hub_themes_one_active ON public.hub_themes USING btree (hub_id) WHERE (is_active = true);


--
-- Name: idx_hubs_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hubs_name ON public.hubs USING btree (name);


--
-- Name: idx_hubs_name_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_hubs_name_normalized ON public.hubs USING btree (name_normalized);


--
-- Name: idx_hubs_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hubs_search ON public.hubs USING gin (search_vector);


--
-- Name: idx_invitations_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_code ON public.invitations USING btree (invitation_code);


--
-- Name: idx_invitations_inviter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_inviter ON public.invitations USING btree (inviter_id);


--
-- Name: idx_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_status ON public.invitations USING btree (status);


--
-- Name: idx_known_bugs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_known_bugs_created_at ON public.known_bugs USING btree (created_at DESC);


--
-- Name: idx_known_bugs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_known_bugs_severity ON public.known_bugs USING btree (severity);


--
-- Name: idx_known_bugs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_known_bugs_status ON public.known_bugs USING btree (status);


--
-- Name: idx_media_files_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_message ON public.media_files USING btree (used_in_message_id);


--
-- Name: idx_media_files_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_user ON public.media_files USING btree (user_id, uploaded_at DESC);


--
-- Name: idx_message_recipient_keys_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_recipient_keys_message ON public.message_recipient_keys USING btree (message_id);


--
-- Name: idx_message_recipient_keys_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_recipient_keys_user ON public.message_recipient_keys USING btree (user_id);


--
-- Name: idx_messages_auto_delete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_auto_delete ON public.messages USING btree (sent_at, deleted_for_recipient) WHERE (deleted_for_recipient = false);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, sent_at DESC);


--
-- Name: idx_messages_delivered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_delivered ON public.messages USING btree (recipient_id, delivered_at) WHERE (delivered_at IS NULL);


--
-- Name: idx_messages_media_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_media_file ON public.messages USING btree (media_file_id) WHERE (media_file_id IS NOT NULL);


--
-- Name: idx_messages_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_read ON public.messages USING btree (recipient_id, read_at) WHERE (read_at IS NULL);


--
-- Name: idx_messages_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_recipient ON public.messages USING btree (recipient_id);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_mod_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_logs_action ON public.mod_logs USING btree (action);


--
-- Name: idx_mod_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_logs_created_at ON public.mod_logs USING btree (created_at DESC);


--
-- Name: idx_mod_logs_hub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_logs_hub ON public.mod_logs USING btree (hub_id);


--
-- Name: idx_mod_logs_moderator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_logs_moderator ON public.mod_logs USING btree (moderator_id);


--
-- Name: idx_mod_logs_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_logs_target ON public.mod_logs USING btree (target_type, target_id);


--
-- Name: idx_notification_batches_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_batches_scheduled ON public.notification_batches USING btree (scheduled_for, status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_notification_batches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_batches_user ON public.notification_batches USING btree (user_id, status);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (notification_type);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read, created_at DESC);


--
-- Name: idx_platform_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_author ON public.platform_posts USING btree (author_id, created_at DESC);


--
-- Name: idx_platform_posts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_created ON public.platform_posts USING btree (created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_gallery ON public.platform_posts USING btree (((gallery_images IS NOT NULL))) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_hot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_hot ON public.platform_posts USING btree (hot_score DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_hot_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_hot_score ON public.platform_posts USING btree (hot_score DESC);


--
-- Name: idx_platform_posts_hub_hot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_hub_hot ON public.platform_posts USING btree (hub_id, hot_score DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_hub_hot_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_hub_hot_score ON public.platform_posts USING btree (hub_id, hot_score DESC);


--
-- Name: idx_platform_posts_hub_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_hub_score ON public.platform_posts USING btree (hub_id, score DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_score ON public.platform_posts USING btree (score DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_score_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_score_created ON public.platform_posts USING btree (score DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_platform_posts_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_search ON public.platform_posts USING gin (search_vector);


--
-- Name: idx_platform_posts_subreddit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_subreddit ON public.platform_posts USING btree (hub_id, created_at DESC);


--
-- Name: idx_platform_posts_subreddit_hot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_subreddit_hot ON public.platform_posts USING btree (target_subreddit, hot_score DESC, created_at DESC) WHERE ((is_deleted = false) AND (target_subreddit IS NOT NULL));


--
-- Name: idx_platform_posts_subreddit_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_subreddit_score ON public.platform_posts USING btree (target_subreddit, score DESC, created_at DESC) WHERE ((is_deleted = false) AND (target_subreddit IS NOT NULL));


--
-- Name: idx_platform_posts_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_tags ON public.platform_posts USING gin (tags);


--
-- Name: idx_platform_posts_target_subreddit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_posts_target_subreddit ON public.platform_posts USING btree (target_subreddit) WHERE (target_subreddit IS NOT NULL);


--
-- Name: idx_post_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_parent ON public.post_comments USING btree (parent_comment_id) WHERE (parent_comment_id IS NOT NULL);


--
-- Name: idx_post_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_post ON public.post_comments USING btree (post_id, created_at DESC);


--
-- Name: idx_post_comments_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_score ON public.post_comments USING btree (post_id, score DESC);


--
-- Name: idx_post_comments_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_search ON public.post_comments USING gin (search_vector);


--
-- Name: idx_post_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_user ON public.post_comments USING btree (user_id, created_at DESC);


--
-- Name: idx_post_comments_user_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_user_post ON public.post_comments USING btree (user_id, post_id, parent_comment_id) WHERE (is_deleted = false);


--
-- Name: idx_post_votes_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_votes_composite ON public.post_votes USING btree (user_id, post_id, is_upvote);


--
-- Name: idx_post_votes_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_votes_post ON public.post_votes USING btree (post_id);


--
-- Name: idx_post_votes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_votes_user ON public.post_votes USING btree (user_id);


--
-- Name: idx_posts_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_pinned ON public.platform_posts USING btree (hub_id, is_pinned) WHERE (is_pinned = true);


--
-- Name: idx_posts_removed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_removed ON public.platform_posts USING btree (is_removed);


--
-- Name: idx_reddit_comment_votes_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_comment_votes_comment_id ON public.reddit_comment_votes USING btree (comment_id);


--
-- Name: idx_reddit_comment_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_comment_votes_user_id ON public.reddit_comment_votes USING btree (user_id);


--
-- Name: idx_reddit_post_comments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_post_comments_created_at ON public.reddit_post_comments USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_reddit_post_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_post_comments_parent ON public.reddit_post_comments USING btree (parent_comment_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_reddit_post_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_post_comments_post ON public.reddit_post_comments USING btree (subreddit, reddit_post_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_reddit_post_comments_reddit_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_post_comments_reddit_parent ON public.reddit_post_comments USING btree (parent_reddit_comment_id) WHERE ((deleted_at IS NULL) AND (parent_reddit_comment_id IS NOT NULL));


--
-- Name: idx_reddit_post_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_post_comments_user ON public.reddit_post_comments USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_reddit_posts_cache_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_posts_cache_key ON public.reddit_posts USING btree (cache_key, expires_at);


--
-- Name: idx_reddit_posts_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_posts_expires ON public.reddit_posts USING btree (expires_at);


--
-- Name: idx_reddit_posts_reddit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_posts_reddit_id ON public.reddit_posts USING btree (reddit_post_id);


--
-- Name: idx_reddit_posts_score_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_posts_score_created ON public.reddit_posts USING btree (score DESC, created_utc DESC, expires_at DESC);


--
-- Name: idx_reddit_posts_subreddit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reddit_posts_subreddit ON public.reddit_posts USING btree (subreddit, created_utc DESC);


--
-- Name: idx_removal_reasons_hub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_removal_reasons_hub ON public.removal_reasons USING btree (hub_id);


--
-- Name: idx_removed_content_hub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_removed_content_hub ON public.removed_content USING btree (hub_id);


--
-- Name: idx_removed_content_removed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_removed_content_removed_at ON public.removed_content USING btree (removed_at);


--
-- Name: idx_removed_content_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_removed_content_type_id ON public.removed_content USING btree (content_type, content_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.reports USING btree (status);


--
-- Name: idx_reports_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_target ON public.reports USING btree (target_type, target_id);


--
-- Name: idx_saved_post_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_post_comments_user ON public.saved_post_comments USING btree (user_id);


--
-- Name: idx_saved_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_posts_user ON public.saved_posts USING btree (user_id);


--
-- Name: idx_saved_reddit_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_reddit_comments_user ON public.saved_reddit_comments USING btree (user_id);


--
-- Name: idx_saved_reddit_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_reddit_posts_user ON public.saved_reddit_posts USING btree (user_id);


--
-- Name: idx_slideshow_media_items_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slideshow_media_items_position ON public.slideshow_media_items USING btree (slideshow_session_id, "position");


--
-- Name: idx_slideshow_media_items_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slideshow_media_items_session ON public.slideshow_media_items USING btree (slideshow_session_id);


--
-- Name: idx_slideshow_sessions_controller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slideshow_sessions_controller ON public.slideshow_sessions USING btree (controller_user_id);


--
-- Name: idx_slideshow_sessions_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slideshow_sessions_conversation ON public.slideshow_sessions USING btree (conversation_id);


--
-- Name: idx_subreddit_subscriptions_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subreddit_subscriptions_name ON public.subreddit_subscriptions USING btree (subreddit_name);


--
-- Name: idx_subreddit_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subreddit_subscriptions_user_id ON public.subreddit_subscriptions USING btree (user_id);


--
-- Name: idx_user_installed_themes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_installed_themes_active ON public.user_installed_themes USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_user_installed_themes_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_installed_themes_theme ON public.user_installed_themes USING btree (theme_id);


--
-- Name: idx_user_installed_themes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_installed_themes_user ON public.user_installed_themes USING btree (user_id);


--
-- Name: idx_user_settings_active_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_settings_active_theme ON public.user_settings USING btree (active_theme_id);


--
-- Name: idx_user_theme_overrides_theme; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_theme_overrides_theme ON public.user_theme_overrides USING btree (theme_id);


--
-- Name: idx_user_theme_overrides_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_theme_overrides_user ON public.user_theme_overrides USING btree (user_id);


--
-- Name: idx_user_themes_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_category ON public.user_themes USING btree (category);


--
-- Name: idx_user_themes_installs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_installs ON public.user_themes USING btree (install_count DESC);


--
-- Name: idx_user_themes_marketplace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_marketplace ON public.user_themes USING btree (is_marketplace) WHERE (is_marketplace = true);


--
-- Name: idx_user_themes_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_public ON public.user_themes USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_user_themes_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_rating ON public.user_themes USING btree (average_rating DESC, rating_count DESC);


--
-- Name: idx_user_themes_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_search ON public.user_themes USING gin (to_tsvector('english'::regconfig, (((theme_name)::text || ' '::text) || COALESCE(theme_description, ''::text))));


--
-- Name: idx_user_themes_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_tags ON public.user_themes USING gin (tags);


--
-- Name: idx_user_themes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_themes_user_id ON public.user_themes USING btree (user_id);


--
-- Name: idx_users_agent_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_agent_activity ON public.users USING btree (last_agent_post_at, last_agent_browse_at);


--
-- Name: idx_users_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_banned ON public.users USING btree (banned) WHERE (banned = true);


--
-- Name: idx_users_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted ON public.users USING btree (deleted) WHERE (deleted = true);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_users_email_encrypted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_encrypted ON public.users USING btree (email_encrypted) WHERE (email IS NOT NULL);


--
-- Name: idx_users_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_seen ON public.users USING btree (last_seen DESC);


--
-- Name: idx_users_public_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_public_key ON public.users USING btree (id) WHERE (public_key IS NOT NULL);


--
-- Name: idx_users_reddit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_reddit_id ON public.users USING btree (reddit_id) WHERE (reddit_id IS NOT NULL);


--
-- Name: idx_users_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_search ON public.users USING gin (search_vector);


--
-- Name: idx_users_shadow_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_shadow_banned ON public.users USING btree (shadow_banned) WHERE (shadow_banned = true);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_users_username_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_username_normalized ON public.users USING btree (username_normalized);


--
-- Name: idx_vote_activity_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_activity_author ON public.vote_activity USING btree (author_id, hour_bucket);


--
-- Name: idx_vote_activity_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_activity_content ON public.vote_activity USING btree (content_type, content_id, hour_bucket);


--
-- Name: comment_votes comment_vote_activity_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comment_vote_activity_trigger AFTER INSERT ON public.comment_votes FOR EACH ROW EXECUTE FUNCTION public.record_comment_vote_activity();


--
-- Name: platform_posts platform_posts_hot_score_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_posts_hot_score_update BEFORE INSERT OR UPDATE OF score, created_at ON public.platform_posts FOR EACH ROW EXECUTE FUNCTION public.update_hot_score_trigger();


--
-- Name: post_votes post_vote_activity_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER post_vote_activity_trigger AFTER INSERT ON public.post_votes FOR EACH ROW EXECUTE FUNCTION public.record_post_vote_activity();


--
-- Name: user_installed_themes trigger_update_theme_install_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_theme_install_count AFTER INSERT ON public.user_installed_themes FOR EACH ROW EXECUTE FUNCTION public.update_theme_install_count();


--
-- Name: user_installed_themes trigger_update_theme_rating; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_theme_rating AFTER INSERT OR UPDATE OF user_rating ON public.user_installed_themes FOR EACH ROW WHEN ((new.user_rating IS NOT NULL)) EXECUTE FUNCTION public.update_theme_rating();


--
-- Name: post_comments tsvector_update_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tsvector_update_comment BEFORE INSERT OR UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.update_comment_search_vector();


--
-- Name: hubs tsvector_update_hub; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tsvector_update_hub BEFORE INSERT OR UPDATE ON public.hubs FOR EACH ROW EXECUTE FUNCTION public.update_hub_search_vector();


--
-- Name: platform_posts tsvector_update_post; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tsvector_update_post BEFORE INSERT OR UPDATE ON public.platform_posts FOR EACH ROW EXECUTE FUNCTION public.update_post_search_vector();


--
-- Name: users tsvector_update_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tsvector_update_user BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_user_search_vector();


--
-- Name: ban_history ban_history_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ban_history
    ADD CONSTRAINT ban_history_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ban_history ban_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ban_history
    ADD CONSTRAINT ban_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocked_users blocked_users_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocked_users blocked_users_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bug_reports bug_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comment_votes comment_votes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: comment_votes comment_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: removed_content fk_removed_content_reason; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content
    ADD CONSTRAINT fk_removed_content_reason FOREIGN KEY (removal_reason_id) REFERENCES public.removal_reasons(id) ON DELETE SET NULL;


--
-- Name: hidden_posts hidden_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_posts
    ADD CONSTRAINT hidden_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.platform_posts(id) ON DELETE CASCADE;


--
-- Name: hidden_posts hidden_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_posts
    ADD CONSTRAINT hidden_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hidden_reddit_posts hidden_reddit_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_reddit_posts
    ADD CONSTRAINT hidden_reddit_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hub_bans hub_bans_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans
    ADD CONSTRAINT hub_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.users(id);


--
-- Name: hub_bans hub_bans_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans
    ADD CONSTRAINT hub_bans_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: hub_bans hub_bans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_bans
    ADD CONSTRAINT hub_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hub_settings hub_settings_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_settings
    ADD CONSTRAINT hub_settings_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: hub_settings hub_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_settings
    ADD CONSTRAINT hub_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: hub_subscriptions hub_subscriptions_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_subscriptions
    ADD CONSTRAINT hub_subscriptions_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: hub_subscriptions hub_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_subscriptions
    ADD CONSTRAINT hub_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hub_themes hub_themes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_themes
    ADD CONSTRAINT hub_themes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hub_themes hub_themes_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_themes
    ADD CONSTRAINT hub_themes_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: hub_themes hub_themes_parent_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_themes
    ADD CONSTRAINT hub_themes_parent_version_id_fkey FOREIGN KEY (parent_version_id) REFERENCES public.hub_themes(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invitations invitations_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_used_in_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_used_in_message_id_fkey FOREIGN KEY (used_in_message_id) REFERENCES public.messages(id);


--
-- Name: media_files media_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_recipient_keys message_recipient_keys_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipient_keys
    ADD CONSTRAINT message_recipient_keys_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_recipient_keys message_recipient_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipient_keys
    ADD CONSTRAINT message_recipient_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_media_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id) ON DELETE SET NULL;


--
-- Name: messages messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mod_logs mod_logs_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_logs
    ADD CONSTRAINT mod_logs_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: mod_logs mod_logs_moderator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_logs
    ADD CONSTRAINT mod_logs_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.users(id);


--
-- Name: notification_batches notification_batches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_batches
    ADD CONSTRAINT notification_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: platform_posts platform_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_posts
    ADD CONSTRAINT platform_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: platform_posts platform_posts_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_posts
    ADD CONSTRAINT platform_posts_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id);


--
-- Name: platform_posts platform_posts_subreddit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_posts
    ADD CONSTRAINT platform_posts_subreddit_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id);


--
-- Name: post_comments post_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.platform_posts(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id);


--
-- Name: post_comments post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: post_votes post_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.platform_posts(id) ON DELETE CASCADE;


--
-- Name: post_votes post_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reddit_comment_votes reddit_comment_votes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_comment_votes
    ADD CONSTRAINT reddit_comment_votes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.reddit_post_comments(id) ON DELETE CASCADE;


--
-- Name: reddit_comment_votes reddit_comment_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_comment_votes
    ADD CONSTRAINT reddit_comment_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reddit_post_comments reddit_post_comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_post_comments
    ADD CONSTRAINT reddit_post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.reddit_post_comments(id) ON DELETE CASCADE;


--
-- Name: reddit_post_comments reddit_post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reddit_post_comments
    ADD CONSTRAINT reddit_post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: removal_reasons removal_reasons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removal_reasons
    ADD CONSTRAINT removal_reasons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: removal_reasons removal_reasons_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removal_reasons
    ADD CONSTRAINT removal_reasons_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: removed_content removed_content_hub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content
    ADD CONSTRAINT removed_content_hub_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: removed_content removed_content_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.removed_content
    ADD CONSTRAINT removed_content_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id);


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_post_comments saved_post_comments_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_post_comments
    ADD CONSTRAINT saved_post_comments_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: saved_post_comments saved_post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_post_comments
    ADD CONSTRAINT saved_post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_posts saved_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.platform_posts(id) ON DELETE CASCADE;


--
-- Name: saved_posts saved_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_posts
    ADD CONSTRAINT saved_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_reddit_comments saved_reddit_comments_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_comments
    ADD CONSTRAINT saved_reddit_comments_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.reddit_post_comments(id) ON DELETE CASCADE;


--
-- Name: saved_reddit_comments saved_reddit_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_comments
    ADD CONSTRAINT saved_reddit_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_reddit_posts saved_reddit_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_reddit_posts
    ADD CONSTRAINT saved_reddit_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: slideshow_media_items slideshow_media_items_media_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_media_items
    ADD CONSTRAINT slideshow_media_items_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: slideshow_media_items slideshow_media_items_slideshow_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_media_items
    ADD CONSTRAINT slideshow_media_items_slideshow_session_id_fkey FOREIGN KEY (slideshow_session_id) REFERENCES public.slideshow_sessions(id) ON DELETE CASCADE;


--
-- Name: slideshow_sessions slideshow_sessions_controller_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_sessions
    ADD CONSTRAINT slideshow_sessions_controller_user_id_fkey FOREIGN KEY (controller_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: slideshow_sessions slideshow_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slideshow_sessions
    ADD CONSTRAINT slideshow_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: hub_moderators subreddit_moderators_subreddit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_moderators
    ADD CONSTRAINT subreddit_moderators_subreddit_id_fkey FOREIGN KEY (hub_id) REFERENCES public.hubs(id) ON DELETE CASCADE;


--
-- Name: hub_moderators subreddit_moderators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hub_moderators
    ADD CONSTRAINT subreddit_moderators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subreddit_subscriptions subreddit_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subreddit_subscriptions
    ADD CONSTRAINT subreddit_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hubs subreddits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubs
    ADD CONSTRAINT subreddits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_activity_baselines user_activity_baselines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_baselines
    ADD CONSTRAINT user_activity_baselines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_installed_themes user_installed_themes_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_installed_themes
    ADD CONSTRAINT user_installed_themes_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.user_themes(id) ON DELETE CASCADE;


--
-- Name: user_installed_themes user_installed_themes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_installed_themes
    ADD CONSTRAINT user_installed_themes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_active_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_active_theme_id_fkey FOREIGN KEY (active_theme_id) REFERENCES public.user_themes(id) ON DELETE SET NULL;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_theme_overrides user_theme_overrides_theme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_theme_overrides
    ADD CONSTRAINT user_theme_overrides_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.user_themes(id) ON DELETE CASCADE;


--
-- Name: user_theme_overrides user_theme_overrides_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_theme_overrides
    ADD CONSTRAINT user_theme_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_themes user_themes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_themes
    ADD CONSTRAINT user_themes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vote_activity vote_activity_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_activity
    ADD CONSTRAINT vote_activity_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
