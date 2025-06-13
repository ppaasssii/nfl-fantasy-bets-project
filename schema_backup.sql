

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_game_details_v6"("p_game_id" bigint) RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$BEGIN
    RETURN (
        SELECT
            json_build_object(
                'id', g.id,
                'api_game_id', g.api_game_id,
                'home_team', g.home_team,
                'away_team', g.away_team,
                'game_time', g.game_time,
                'status', g.status,
                'bet_categories', (
                    SELECT json_agg(category_data ORDER BY category_order)
                    FROM (
                        SELECT
                            -- Kategorien gruppieren
                            CASE
                                WHEN bt.main_category IN ('Main', 'Total', 'Team Props') THEN 'Game Lines'
                                ELSE bt.main_category
                            END as "main_category",
                            CASE
                                WHEN bt.main_category IN ('Main', 'Total', 'Team Props') THEN 'Game Lines'
                                ELSE bt.main_category
                            END as "displayName",
                            -- Sortierreihenfolge für Kategorien
                            CASE
                                WHEN bt.main_category IN ('Main', 'Total', 'Team Props') THEN 1
                                WHEN bt.main_category LIKE 'Player%' THEN 2
                                ELSE 3
                            END as category_order,
                            -- Märkte für jede Kategorie aggregieren
                            json_agg(DISTINCT market_data.market) AS markets
                        FROM
                            public.available_bets ab
                        JOIN public.bet_types bt ON ab.bet_type_id = bt.id
                        -- KORREKTUR: CROSS JOIN kommt VOR der WHERE-Klausel
                        CROSS JOIN LATERAL (
                           SELECT jsonb_build_object(
                               'market_name', bt.market_name,
                               'player_name', ab.player_name_extracted,
                               'options', (
                                   SELECT json_agg(
                                       json_build_object(
                                           'id', ab_inner.id,
                                           'display_name', ab_inner.display_name,
                                           'odds', ab_inner.odds,
                                           'line', ab_inner.line,
                                           'is_active', ab_inner.is_active
                                       )
                                       ORDER BY ab_inner.odds ASC
                                   )
                                   FROM public.available_bets ab_inner
                                   WHERE ab_inner.bet_type_id = bt.id
                                     AND ab_inner.game_id = g.id
                                     AND ab_inner.player_name_extracted IS NOT DISTINCT FROM ab.player_name_extracted
                               )
                           ) as market
                        ) market_data
                        WHERE
                            ab.game_id = p_game_id
                            -- Optionaler Filter für realistische Quoten
                            AND ab.odds BETWEEN -2000 AND 2000
                        GROUP BY
                            1, 2, 3 -- Gruppieren nach main_category, displayName, und category_order
                    ) AS category_data
                )
            )
        FROM
            public.games g
        WHERE
            g.id = p_game_id
    );
END;$$;


ALTER FUNCTION "public"."get_game_details_v6"("p_game_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_games_for_gamelist_v6"() RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  RETURN (
    SELECT 
      json_agg(t)
    FROM (
      SELECT
        g.id, g.api_game_id, g.home_team, g.away_team, g.game_time, g.status, g.home_score, g.away_score,
        COALESCE(ht.abbr, SUBSTRING(g.home_team, 1, 3)) as home_team_abbr,
        COALESCE(at.abbr, SUBSTRING(g.away_team, 1, 3)) as away_team_abbr,
        json_build_object(
          'moneyline', (
            SELECT json_agg(ml_bet ORDER BY ml_bet.odds ASC)
            FROM (SELECT ab.id, ab.odds, ab.display_name AS selection_name FROM public.available_bets ab JOIN public.bet_types bt ON ab.bet_type_id = bt.id WHERE ab.game_id = g.id AND bt.sub_category = 'Moneyline') AS ml_bet
          ),
          'spread', (
            SELECT json_agg(sp_bet ORDER BY sp_bet.line ASC)
            FROM (SELECT ab.id, ab.odds, ab.line, ab.display_name AS selection_name FROM public.available_bets ab JOIN public.bet_types bt ON ab.bet_type_id = bt.id WHERE ab.game_id = g.id AND bt.sub_category = 'Spread') AS sp_bet
          ),
          'total', (
            SELECT json_agg(ou_bet ORDER BY ou_bet.selection_name) -- Korrigiert von display_name
            FROM (SELECT ab.id, ab.odds, ab.line, ab.display_name AS selection_name FROM public.available_bets ab JOIN public.bet_types bt ON ab.bet_type_id = bt.id WHERE ab.game_id = g.id AND bt.sub_category = 'Game Total') AS ou_bet
          )
        ) AS quick_bets
      FROM public.games g
      LEFT JOIN public.teams ht ON g.home_team = ht.name
      LEFT JOIN public.teams at ON g.away_team = at.name
      WHERE g.game_time >= (now() - interval '6 hours')
      ORDER BY g.game_time ASC
    ) t
  );
END;$$;


ALTER FUNCTION "public"."get_games_for_gamelist_v6"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_games_with_pending_bets_to_settle"() RETURNS TABLE("game_id" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT g.id
    FROM public.games g
    JOIN public.available_bets ab ON g.id = ab.game_id
    JOIN public.user_bet_selections ubs ON ab.id = ubs.available_bet_id
    JOIN public.user_bets ub ON ubs.user_bet_id = ub.id
    WHERE g.status IN ('final', 'completed', 'F/OT', 'final (ot)') -- Ensure these match your actual 'finished' game statuses
      AND ub.status = 'pending'
      AND g.home_score IS NOT NULL 
      AND g.away_score IS NOT NULL; -- Ensure scores are present for settlement
END;
$$;


ALTER FUNCTION "public"."get_games_with_pending_bets_to_settle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  INSERT INTO public.profiles (id, username, fantasy_balance, created_at, updated_at)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), 1000.00, NOW(), NOW());
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_place_bet_transaction"("user_id_input" "uuid", "stake_amount_input" numeric, "selections_input" "jsonb", "bet_type_input" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    profile_record record;
    new_balance numeric;
    selection jsonb;
    available_bet_record record; 
    game_record record; 
    user_bet_id_output bigint;
    calculated_decimal_odd numeric;
    calculated_potential_payout numeric;
    stake_per_bet numeric; 
    success_count integer := 0;
    error_message_text text := '';
    operation_summary text;
    transaction_description text;
    final_result_data jsonb := '[]'::jsonb;
    failed_selection_count integer := 0; -- Zählt, wie viele Einzelwetten fehlschlagen
BEGIN
    -- 1. Guthaben prüfen und für Update sperren
    SELECT id, fantasy_balance INTO profile_record FROM public.profiles WHERE id = user_id_input FOR UPDATE;

    IF profile_record.id IS NULL THEN
        RAISE EXCEPTION 'Profile not found for user ID: %', user_id_input;
    END IF;

    IF profile_record.fantasy_balance < stake_amount_input THEN
        RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', stake_amount_input, profile_record.fantasy_balance;
    END IF;

    -- Logik für Einzelwetten
    IF bet_type_input = 'single' THEN
        IF jsonb_array_length(selections_input) = 0 THEN
            RAISE EXCEPTION 'No selections provided for single bets.';
        END IF;
        
        stake_per_bet := stake_amount_input / jsonb_array_length(selections_input);

        IF stake_per_bet < 0.01 THEN
             RAISE EXCEPTION 'Stake per bet ($%) is too low for % single bets.', stake_per_bet, jsonb_array_length(selections_input);
        END IF;

        -- Guthaben einmal für alle Einzelwetten abziehen
        -- Dies geschieht hier, damit bei Teilerfolgen das Guthaben korrekt reduziert ist.
        -- Wenn ALLE Einzelwetten fehlschlagen (s.u.), wird die Transaktion zurückgerollt.
        new_balance := profile_record.fantasy_balance - stake_amount_input;
        UPDATE public.profiles SET fantasy_balance = new_balance WHERE id = user_id_input;

        operation_summary := 'Processed single bets: ';

        FOR selection IN SELECT * FROM jsonb_array_elements(selections_input)
        LOOP
            BEGIN 
                SELECT ab.id, ab.odds, ab.line, ab.is_active, ab.game_id, g.status as game_status, g.game_time 
                INTO available_bet_record
                FROM public.available_bets ab
                JOIN public.games g ON ab.game_id = g.id
                WHERE ab.id = (selection->>'available_bet_id')::bigint;

                IF available_bet_record.id IS NULL THEN
                    error_message_text := error_message_text || 'Bet option ' || (selection->>'available_bet_id')::text || ' not found. ';
                    failed_selection_count := failed_selection_count + 1;
                    CONTINUE; 
                END IF;
                IF NOT available_bet_record.is_active THEN
                    error_message_text := error_message_text || 'Bet option ' || available_bet_record.id::text || ' is not active. ';
                    failed_selection_count := failed_selection_count + 1;
                    CONTINUE; 
                END IF;
                
                -- Implementierte Spielstartzeit-Prüfung
                IF available_bet_record.game_time <= now() OR available_bet_record.game_status IN ('live', 'inprogress', 'finished', 'FT', 'Final') THEN
                    error_message_text := error_message_text || 'Game for bet ' || available_bet_record.id::text || ' (status: ' || available_bet_record.game_status || ', time: ' || available_bet_record.game_time || ') has started/finished. ';
                    failed_selection_count := failed_selection_count + 1;
                    CONTINUE;
                END IF;

                calculated_decimal_odd := CASE 
                                            WHEN available_bet_record.odds > 0 THEN (available_bet_record.odds / 100.0) + 1
                                            WHEN available_bet_record.odds < 0 THEN (100.0 / ABS(available_bet_record.odds)) + 1
                                            ELSE 1 
                                          END;
                calculated_potential_payout := stake_per_bet * calculated_decimal_odd;

                INSERT INTO public.user_bets (user_id, stake_amount, total_odds, potential_payout, bet_type, status)
                VALUES (user_id_input, stake_per_bet, calculated_decimal_odd, calculated_potential_payout, 'single', 'pending')
                RETURNING id INTO user_bet_id_output;

                INSERT INTO public.user_bet_selections (user_bet_id, available_bet_id, odds_at_placement, line_at_placement)
                VALUES (user_bet_id_output, available_bet_record.id, available_bet_record.odds, available_bet_record.line);

                transaction_description := 'Placed single bet (ID: ' || user_bet_id_output || ')';
                INSERT INTO public.transactions (user_id, type, amount, related_user_bet_id, description)
                VALUES (user_id_input, 'bet_placed_single', -stake_per_bet, user_bet_id_output, transaction_description);
                
                success_count := success_count + 1;
                final_result_data := final_result_data || jsonb_build_object('user_bet_id', user_bet_id_output, 'status', 'success', 'selection_id', available_bet_record.id);
            EXCEPTION
                WHEN OTHERS THEN
                     error_message_text := error_message_text || 'Error processing selection ' || (selection->>'available_bet_id')::text || ': ' || SQLERRM || '. ';
                     failed_selection_count := failed_selection_count + 1;
            END;
        END LOOP;

        -- Wenn alle Einzelwetten fehlgeschlagen sind, werfe einen Fehler, um die Haupttransaktion (inkl. Guthabenabzug) zurückzurollen.
        IF success_count = 0 AND jsonb_array_length(selections_input) > 0 THEN
             RAISE EXCEPTION 'All single bets failed to process. Errors: %', rtrim(error_message_text, '. ');
        END IF;
        
        operation_summary := success_count || ' of ' || jsonb_array_length(selections_input) || ' single bet(s) placed.';
        RETURN jsonb_build_object('success', true, 'message', operation_summary, 'new_balance', new_balance, 'details', final_result_data, 'errors', CASE WHEN error_message_text = '' THEN null ELSE rtrim(error_message_text, '. ') END);

    -- Logik für Parlay-Wetten
    ELSIF bet_type_input = 'parlay' THEN
        stake_per_bet := stake_amount_input; 
        operation_summary := 'Processing combi bet: ';
        calculated_decimal_odd := 1.0; 

        FOR selection IN SELECT * FROM jsonb_array_elements(selections_input)
        LOOP
            SELECT ab.id, ab.odds, ab.line, ab.is_active, ab.game_id, g.status as game_status, g.game_time
            INTO available_bet_record
            FROM public.available_bets ab
            JOIN public.games g ON ab.game_id = g.id
            WHERE ab.id = (selection->>'available_bet_id')::bigint;

            IF NOT FOUND OR available_bet_record.id IS NULL THEN RAISE EXCEPTION 'Parlay selection % not found.', selection->>'available_bet_id'; END IF;
            IF NOT available_bet_record.is_active THEN RAISE EXCEPTION 'Parlay selection % is not active.', available_bet_record.id; END IF;
            
            -- Implementierte Spielstartzeit-Prüfung
            IF available_bet_record.game_time <= now() OR available_bet_record.game_status IN ('live', 'inprogress', 'finished', 'FT', 'Final') THEN
                 RAISE EXCEPTION 'Game for parlay selection % (status: %, time: %) has started or finished.', available_bet_record.id, available_bet_record.game_status, available_bet_record.game_time;
            END IF;

            calculated_decimal_odd := calculated_decimal_odd * (
                                        CASE 
                                            WHEN available_bet_record.odds > 0 THEN (available_bet_record.odds / 100.0) + 1
                                            WHEN available_bet_record.odds < 0 THEN (100.0 / ABS(available_bet_record.odds)) + 1
                                            ELSE 1 
                                        END
                                    );
        END LOOP;
        
        IF jsonb_array_length(selections_input) = 0 THEN
             RAISE EXCEPTION 'No selections provided for combi bet.';
        END IF;

        calculated_potential_payout := stake_per_bet * calculated_decimal_odd;

        -- Guthaben erst hier abziehen, nachdem alle Parlay-Legs validiert wurden
        new_balance := profile_record.fantasy_balance - stake_per_bet;
        UPDATE public.profiles SET fantasy_balance = new_balance WHERE id = user_id_input;

        INSERT INTO public.user_bets (user_id, stake_amount, total_odds, potential_payout, bet_type, status)
        VALUES (user_id_input, stake_per_bet, calculated_decimal_odd, calculated_potential_payout, 'parlay', 'pending')
        RETURNING id INTO user_bet_id_output;

        FOR selection IN SELECT * FROM jsonb_array_elements(selections_input)
        LOOP
            SELECT odds, line INTO available_bet_record 
            FROM public.available_bets 
            WHERE id = (selection->>'available_bet_id')::bigint;

            INSERT INTO public.user_bet_selections (user_bet_id, available_bet_id, odds_at_placement, line_at_placement)
            VALUES (user_bet_id_output, (selection->>'available_bet_id')::bigint, available_bet_record.odds, available_bet_record.line);
        END LOOP;

        transaction_description := 'Placed combi bet (ID: ' || user_bet_id_output || ')';
        INSERT INTO public.transactions (user_id, type, amount, related_user_bet_id, description)
        VALUES (user_id_input, 'bet_placed_parlay', -stake_per_bet, user_bet_id_output, transaction_description);

        RETURN jsonb_build_object('success', true, 'user_bet_id', user_bet_id_output, 'new_balance', new_balance, 'message', 'Combi bet placed successfully.');
    ELSE
        RAISE EXCEPTION 'Invalid bet_type provided: %', bet_type_input;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[handle_place_bet_transaction] UID: %, Error: %', user_id_input, SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', SQLERRM || ' (Occurred for user: ' || user_id_input || ')');
END;
$_$;


ALTER FUNCTION "public"."handle_place_bet_transaction"("user_id_input" "uuid", "stake_amount_input" numeric, "selections_input" "jsonb", "bet_type_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_fantasy_balance"("user_id_input" "uuid", "increment_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles
  SET fantasy_balance = fantasy_balance + increment_amount,
      updated_at = NOW()
  WHERE id = user_id_input;
END;
$$;


ALTER FUNCTION "public"."increment_fantasy_balance"("user_id_input" "uuid", "increment_amount" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."available_bets" (
    "id" bigint NOT NULL,
    "game_id" bigint NOT NULL,
    "bet_type_id" bigint NOT NULL,
    "api_odd_id" "text" NOT NULL,
    "api_stat_entity_id" "text",
    "api_period_id" "text" NOT NULL,
    "api_side_id" "text",
    "player_name_extracted" "text",
    "selection_name_api" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "odds" numeric NOT NULL,
    "line" numeric,
    "is_active" boolean DEFAULT true,
    "is_winning_outcome" boolean,
    "last_api_update" timestamp with time zone,
    "bookmaker_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "api_stat_id" "text",
    "api_bet_type_id" "text"
);


ALTER TABLE "public"."available_bets" OWNER TO "postgres";


ALTER TABLE "public"."available_bets" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."available_bets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."bet_types" (
    "id" bigint NOT NULL,
    "api_stat_id" "text" NOT NULL,
    "api_bet_type_id" "text" NOT NULL,
    "market_name" "text" NOT NULL,
    "main_category" "text" NOT NULL,
    "sub_category" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bet_types" OWNER TO "postgres";


ALTER TABLE "public"."bet_types" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."bet_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" bigint NOT NULL,
    "api_game_id" "text" NOT NULL,
    "home_team" "text" NOT NULL,
    "away_team" "text" NOT NULL,
    "game_time" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "home_score" smallint,
    "away_score" smallint,
    "last_odds_update" timestamp with time zone,
    "last_score_update" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "api_results_data" "jsonb",
    "api_response_data" "jsonb"
);


ALTER TABLE "public"."games" OWNER TO "postgres";


ALTER TABLE "public"."games" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."games_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "username" "text" DEFAULT ''::"text",
    "fantasy_balance" numeric DEFAULT '1000'::numeric,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" bigint NOT NULL,
    "api_team_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text",
    "abbreviation" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbr" character varying(10)
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."teams" IS 'Stores information about sports teams.';



CREATE SEQUENCE IF NOT EXISTS "public"."teams_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."teams_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."teams_id_seq" OWNED BY "public"."teams"."id";



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "related_user_bet_id" bigint,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


ALTER TABLE "public"."transactions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_bet_selections" (
    "id" bigint NOT NULL,
    "user_bet_id" bigint NOT NULL,
    "available_bet_id" bigint NOT NULL,
    "odds_at_placement" numeric NOT NULL,
    "actual_stat_value_at_settlement" numeric,
    "line_at_placement" numeric
);


ALTER TABLE "public"."user_bet_selections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_bet_selections"."actual_stat_value_at_settlement" IS 'The actual stat value that was used to determine the outcome of this bet selection at the time of settlement.';



ALTER TABLE "public"."user_bet_selections" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_bet_selections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_bets" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stake_amount" numeric NOT NULL,
    "potential_payout" numeric NOT NULL,
    "total_odds" numeric(12,4) NOT NULL,
    "status" "text" NOT NULL,
    "bet_type" "text" NOT NULL,
    "placed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_bets" OWNER TO "postgres";


ALTER TABLE "public"."user_bets" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_bets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."teams" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."teams_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."available_bets"
    ADD CONSTRAINT "available_bets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bet_types"
    ADD CONSTRAINT "bet_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_api_game_id_key" UNIQUE ("api_game_id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_api_team_id_key" UNIQUE ("api_team_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."available_bets"
    ADD CONSTRAINT "unique_available_bet_api_odd_id_per_game" UNIQUE ("game_id", "api_odd_id");



ALTER TABLE ONLY "public"."bet_types"
    ADD CONSTRAINT "unique_bet_market_v2" UNIQUE ("api_stat_id", "api_bet_type_id", "market_name");



ALTER TABLE ONLY "public"."user_bet_selections"
    ADD CONSTRAINT "user_bet_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_bets"
    ADD CONSTRAINT "user_bets_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_available_bets_api_odd_id" ON "public"."available_bets" USING "btree" ("api_odd_id");



CREATE INDEX "idx_available_bets_bet_type_id" ON "public"."available_bets" USING "btree" ("bet_type_id");



CREATE INDEX "idx_available_bets_game_id" ON "public"."available_bets" USING "btree" ("game_id");



CREATE INDEX "idx_bet_types_api_keys" ON "public"."bet_types" USING "btree" ("api_stat_id", "api_bet_type_id");



ALTER TABLE ONLY "public"."available_bets"
    ADD CONSTRAINT "available_bets_bet_type_id_fkey" FOREIGN KEY ("bet_type_id") REFERENCES "public"."bet_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."available_bets"
    ADD CONSTRAINT "available_bets_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_related_user_bet_id_fkey" FOREIGN KEY ("related_user_bet_id") REFERENCES "public"."user_bets"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_bet_selections"
    ADD CONSTRAINT "user_bet_selections_available_bet_id_fkey" FOREIGN KEY ("available_bet_id") REFERENCES "public"."available_bets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_bet_selections"
    ADD CONSTRAINT "user_bet_selections_user_bet_id_fkey" FOREIGN KEY ("user_bet_id") REFERENCES "public"."user_bets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_bets"
    ADD CONSTRAINT "user_bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Enable read access for all users" ON "public"."games" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can select their own bet selections" ON "public"."user_bet_selections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_bets"
  WHERE (("user_bets"."id" = "user_bet_selections"."user_bet_id") AND ("auth"."uid"() = "user_bets"."user_id")))));



CREATE POLICY "Users can select their own bets" ON "public"."user_bets" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_bet_selections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_bets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";












GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































GRANT ALL ON FUNCTION "public"."get_game_details_v6"("p_game_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_game_details_v6"("p_game_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_game_details_v6"("p_game_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_games_for_gamelist_v6"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_games_for_gamelist_v6"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_games_for_gamelist_v6"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_games_with_pending_bets_to_settle"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_games_with_pending_bets_to_settle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_games_with_pending_bets_to_settle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_place_bet_transaction"("user_id_input" "uuid", "stake_amount_input" numeric, "selections_input" "jsonb", "bet_type_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_place_bet_transaction"("user_id_input" "uuid", "stake_amount_input" numeric, "selections_input" "jsonb", "bet_type_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_place_bet_transaction"("user_id_input" "uuid", "stake_amount_input" numeric, "selections_input" "jsonb", "bet_type_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_fantasy_balance"("user_id_input" "uuid", "increment_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_fantasy_balance"("user_id_input" "uuid", "increment_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_fantasy_balance"("user_id_input" "uuid", "increment_amount" numeric) TO "service_role";
























GRANT ALL ON TABLE "public"."available_bets" TO "anon";
GRANT ALL ON TABLE "public"."available_bets" TO "authenticated";
GRANT ALL ON TABLE "public"."available_bets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."available_bets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."available_bets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."available_bets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bet_types" TO "anon";
GRANT ALL ON TABLE "public"."bet_types" TO "authenticated";
GRANT ALL ON TABLE "public"."bet_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bet_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bet_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bet_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_bet_selections" TO "anon";
GRANT ALL ON TABLE "public"."user_bet_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bet_selections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_bet_selections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_bet_selections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_bet_selections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_bets" TO "anon";
GRANT ALL ON TABLE "public"."user_bets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_bets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_bets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_bets_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
