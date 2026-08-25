-- Bring legacy registration grants up to the current 10-point contract.
-- The adjustment request key makes this migration safe to execute repeatedly.
WITH eligible AS (
  SELECT
    pa.user_id,
    10 - COALESCE((
      SELECT SUM(pl.amount)
      FROM point_ledgers pl
      WHERE pl.user_id = pa.user_id
        AND pl.type = 'REGISTER_GRANT'
        AND pl.source = 'REGISTRATION'
    ), 0) AS delta
  FROM point_accounts pa
  WHERE pa.signup_granted_at IS NOT NULL
    AND COALESCE((
      SELECT SUM(pl.amount)
      FROM point_ledgers pl
      WHERE pl.user_id = pa.user_id
        AND pl.type = 'REGISTER_GRANT'
        AND pl.source = 'REGISTRATION'
    ), 0) BETWEEN 1 AND 9
    AND NOT EXISTS (
      SELECT 1
      FROM point_ledgers existing
      WHERE existing.type = 'MANUAL_ADJUSTMENT'
        AND existing.request_key = 'registration-bonus-v10:' || pa.user_id::text
    )
  FOR UPDATE OF pa
), updated AS (
  UPDATE point_accounts pa
  SET balance = pa.balance + eligible.delta,
      updated_at = now()
  FROM eligible
  WHERE pa.user_id = eligible.user_id
    AND eligible.delta > 0
  RETURNING pa.user_id, pa.balance, eligible.delta
)
INSERT INTO point_ledgers(user_id, type, amount, balance_after, request_key, source)
SELECT
  updated.user_id,
  'MANUAL_ADJUSTMENT',
  updated.delta,
  updated.balance,
  'registration-bonus-v10:' || updated.user_id::text,
  'REGISTRATION_BONUS_TOPUP_V10'
FROM updated
ON CONFLICT (type, request_key) DO NOTHING;
