-- Revert calculate_hot_score function to accept TIMESTAMP (without time zone)

CREATE OR REPLACE FUNCTION calculate_hot_score(
    ups INTEGER,
    downs INTEGER,
    created_at TIMESTAMP
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    score INTEGER;
    sign_val DOUBLE PRECISION;
    order_val DOUBLE PRECISION;
    seconds DOUBLE PRECISION;
    epoch TIMESTAMP := '2005-12-08 07:46:43 UTC';
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
$$ LANGUAGE plpgsql IMMUTABLE;
