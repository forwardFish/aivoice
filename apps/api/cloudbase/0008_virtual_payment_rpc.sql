CREATE OR REPLACE FUNCTION rpc_virtual_payment_apply_refund(
  p_order_no text,
  p_refund_id text,
  p_refund_fee integer,
  p_refunded_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account point_accounts%ROWTYPE;
  v_revoke integer;
BEGIN
  PERFORM _rpc_assert_caller(ARRAY['service_role','api_role']);
  SELECT * INTO v_order FROM orders WHERE order_no=p_order_no FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status='REFUNDED' THEN
    SELECT * INTO v_account FROM point_accounts WHERE user_id=v_order.user_id;
    RETURN jsonb_build_object('orderId',v_order.id,'status','REFUNDED','balance',COALESCE(v_account.balance,0),'revoked',0,'idempotent',true);
  END IF;
  IF v_order.status<>'PAID' THEN RAISE EXCEPTION 'ORDER_NOT_PAID'; END IF;
  IF p_refund_fee IS NULL OR p_refund_fee<>v_order.amount_fen THEN RAISE EXCEPTION 'REFUND_AMOUNT_MISMATCH'; END IF;
  SELECT * INTO v_account FROM point_accounts WHERE user_id=v_order.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POINT_ACCOUNT_NOT_FOUND'; END IF;
  v_revoke := LEAST(v_account.balance, v_order.points);
  UPDATE point_accounts SET balance=balance-v_revoke,updated_at=now() WHERE user_id=v_order.user_id RETURNING * INTO v_account;
  INSERT INTO point_ledgers(user_id,order_id,type,amount,balance_after,request_key,source)
  VALUES(v_order.user_id,v_order.id,'REFUND',-v_revoke,v_account.balance,'refund:'||v_order.id::text,'VIRTUAL_PAY_REFUND')
  ON CONFLICT(type,order_id) DO NOTHING;
  UPDATE orders SET status='REFUNDED',notify_digest=COALESCE(NULLIF(p_refund_id,''),notify_digest),updated_at=COALESCE(p_refunded_at,now())
  WHERE id=v_order.id RETURNING * INTO v_order;
  RETURN jsonb_build_object(
    'orderId',v_order.id,
    'status',v_order.status,
    'balance',v_account.balance,
    'revoked',v_revoke,
    'unrecoveredPoints',GREATEST(v_order.points-v_revoke,0),
    'idempotent',false
  );
END;
$$;

REVOKE ALL ON FUNCTION rpc_virtual_payment_apply_refund(text,text,integer,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_virtual_payment_apply_refund(text,text,integer,timestamptz) TO service_role;
