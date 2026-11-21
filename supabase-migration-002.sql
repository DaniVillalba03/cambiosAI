-- ========================================================
-- MiCambio · Migración 002
-- - Operaciones atómicas: toda la lógica de saldos/stock en funciones de Postgres
--   que se ejecutan en una sola transacción y en fila (advisory lock).
--   Dos mensajes al mismo tiempo ya no pueden descuadrar los saldos.
-- - Nuevos tipos: INGRESO (plata que entra) y TRANSFERENCIA (entre cuentas)
-- - Quién anotó cada movimiento (registered_by) y desde dónde (source)
-- - Comprobantes pendientes de confirmación por WhatsApp
-- Idempotente: se puede ejecutar más de una vez.
-- ========================================================

-- 1. Columnas y tipos nuevos ---------------------------------------------
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS to_account TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS registered_by TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('COMPRA', 'VENTA', 'GASTO', 'INGRESO', 'TRANSFERENCIA'));

-- 2. Comprobantes esperando "Guardar / Cancelar" en WhatsApp ---------------
CREATE TABLE IF NOT EXISTS public.pending_operations (
    id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pending_operations ENABLE ROW LEVEL SECURITY; -- solo el servidor

-- 3. Funciones internas --------------------------------------------------
CREATE OR REPLACE FUNCTION public._acc_add(p_id TEXT, p_currency TEXT, p_delta NUMERIC, p_floor BOOLEAN DEFAULT FALSE)
RETURNS NUMERIC LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_new NUMERIC;
BEGIN
  INSERT INTO accounts (id, name, type, currency, balance)
  VALUES (p_id, p_id, CASE WHEN p_id LIKE 'Efectivo%' THEN 'CASH' ELSE 'BANK' END, p_currency,
          CASE WHEN p_floor THEN GREATEST(0, p_delta) ELSE p_delta END)
  ON CONFLICT (id) DO UPDATE
    SET balance = CASE WHEN p_floor THEN GREATEST(0, accounts.balance + p_delta) ELSE accounts.balance + p_delta END,
        updated_at = NOW()
  RETURNING balance INTO v_new;
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public._stock_set(p_cur TEXT, p_amount NUMERIC, p_cost NUMERIC)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a NUMERIC := GREATEST(0, p_amount); c NUMERIC;
BEGIN
  c := CASE WHEN a > 0 THEN GREATEST(0, p_cost) ELSE 0 END;
  INSERT INTO currency_stocks (currency, amount, total_cost_pyg, average_cost, updated_at)
  VALUES (p_cur, a, c, CASE WHEN a > 0 THEN c / a ELSE 0 END, NOW())
  ON CONFLICT (currency) DO UPDATE
    SET amount = EXCLUDED.amount, total_cost_pyg = EXCLUDED.total_cost_pyg,
        average_cost = EXCLUDED.average_cost, updated_at = NOW();
END $$;

-- Aplica el efecto de una operación. Devuelve {profit, warnings}.
CREATE OR REPLACE FUNCTION public._apply_op(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_type TEXT := p->>'type';
  v_cur TEXT := p->>'currency';
  v_amt NUMERIC := COALESCE((p->>'amount')::NUMERIC, 0);
  v_rate NUMERIC := COALESCE((p->>'rate')::NUMERIC, 0);
  v_total NUMERIC := COALESCE((p->>'totalPYG')::NUMERIC, 0);
  v_acc TEXT := p->>'account';
  v_to TEXT := p->>'toAccount';
  v_profit NUMERIC := NULL;
  v_warn JSONB := '[]'::JSONB;
  s_amt NUMERIC; s_cost NUMERIC; s_avg NUMERIC; v_bal NUMERIC;
BEGIN
  IF v_type = 'COMPRA' THEN
    v_bal := _acc_add(v_acc, 'PYG', -v_total);
    IF v_bal < 0 THEN v_warn := v_warn || to_jsonb(format('El saldo de %s quedó en negativo.', v_acc)); END IF;
    PERFORM _acc_add('Efectivo ' || v_cur, v_cur, v_amt);
    SELECT amount, total_cost_pyg INTO s_amt, s_cost FROM currency_stocks WHERE currency = v_cur FOR UPDATE;
    PERFORM _stock_set(v_cur, COALESCE(s_amt, 0) + v_amt, COALESCE(s_cost, 0) + v_total);

  ELSIF v_type = 'VENTA' THEN
    SELECT amount, total_cost_pyg, average_cost INTO s_amt, s_cost, s_avg FROM currency_stocks WHERE currency = v_cur FOR UPDATE;
    s_amt := COALESCE(s_amt, 0); s_cost := COALESCE(s_cost, 0); s_avg := COALESCE(s_avg, 0);
    IF s_avg > 0 THEN
      v_profit := ROUND((v_rate - s_avg) * v_amt);
    ELSE
      v_warn := v_warn || to_jsonb(format('No había costo promedio cargado para %s: no se calculó la ganancia.', v_cur));
    END IF;
    IF v_amt > s_amt THEN
      v_warn := v_warn || to_jsonb(format('Vendiste %s %s pero el stock era %s. El stock quedó en 0.', v_amt, v_cur, s_amt));
    END IF;
    PERFORM _acc_add(v_acc, 'PYG', v_total);
    PERFORM _acc_add('Efectivo ' || v_cur, v_cur, -v_amt, TRUE);
    PERFORM _stock_set(v_cur, s_amt - v_amt, s_cost - s_avg * v_amt);

  ELSIF v_type = 'GASTO' THEN
    v_bal := _acc_add(v_acc, 'PYG', -v_total);
    IF v_bal < 0 THEN v_warn := v_warn || to_jsonb(format('El saldo de %s quedó en negativo.', v_acc)); END IF;

  ELSIF v_type = 'INGRESO' THEN
    PERFORM _acc_add(v_acc, 'PYG', v_total);

  ELSIF v_type = 'TRANSFERENCIA' THEN
    IF v_to IS NULL OR v_to = v_acc THEN RAISE EXCEPTION 'Transferencia sin cuenta destino válida'; END IF;
    v_bal := _acc_add(v_acc, 'PYG', -v_total);
    IF v_bal < 0 THEN v_warn := v_warn || to_jsonb(format('El saldo de %s quedó en negativo.', v_acc)); END IF;
    PERFORM _acc_add(v_to, 'PYG', v_total);

  ELSE
    RAISE EXCEPTION 'Tipo de operación desconocido: %', v_type;
  END IF;

  RETURN jsonb_build_object('profit', v_profit, 'warnings', v_warn);
END $$;

-- Revierte el efecto de una operación ya guardada.
CREATE OR REPLACE FUNCTION public._revert_op(t public.transactions)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s_amt NUMERIC; s_cost NUMERIC; v_cost_sold NUMERIC;
BEGIN
  IF t.type = 'COMPRA' THEN
    PERFORM _acc_add(t.account, 'PYG', t.total_pyg);
    PERFORM _acc_add('Efectivo ' || t.currency, t.currency, -COALESCE(t.amount, 0), TRUE);
    SELECT amount, total_cost_pyg INTO s_amt, s_cost FROM currency_stocks WHERE currency = t.currency FOR UPDATE;
    PERFORM _stock_set(t.currency, COALESCE(s_amt, 0) - COALESCE(t.amount, 0), COALESCE(s_cost, 0) - t.total_pyg);
  ELSIF t.type = 'VENTA' THEN
    PERFORM _acc_add(t.account, 'PYG', -t.total_pyg);
    PERFORM _acc_add('Efectivo ' || t.currency, t.currency, COALESCE(t.amount, 0));
    -- Sin ganancia registrada no se había descontado costo
    v_cost_sold := CASE WHEN t.profit IS NULL THEN 0 ELSE t.total_pyg - t.profit END;
    SELECT amount, total_cost_pyg INTO s_amt, s_cost FROM currency_stocks WHERE currency = t.currency FOR UPDATE;
    PERFORM _stock_set(t.currency, COALESCE(s_amt, 0) + COALESCE(t.amount, 0), COALESCE(s_cost, 0) + v_cost_sold);
  ELSIF t.type = 'GASTO' THEN
    PERFORM _acc_add(t.account, 'PYG', t.total_pyg);
  ELSIF t.type = 'INGRESO' THEN
    PERFORM _acc_add(t.account, 'PYG', -t.total_pyg);
  ELSIF t.type = 'TRANSFERENCIA' THEN
    PERFORM _acc_add(t.account, 'PYG', t.total_pyg);
    PERFORM _acc_add(t.to_account, 'PYG', -t.total_pyg);
  END IF;
END $$;

-- 4. Funciones públicas (solo el servidor puede llamarlas) ------------------
CREATE OR REPLACE FUNCTION public.record_operation(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB; v_num INTEGER; v_id TEXT; v_ts TIMESTAMPTZ := NOW();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('micambio_ops'));
  r := _apply_op(p);
  SELECT COALESCE(MAX(operation_number), 0) + 1 INTO v_num FROM transactions;
  v_id := COALESCE(p->>'id', 'op_' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT || '_' || substr(md5(random()::TEXT), 1, 7));
  INSERT INTO transactions (id, operation_number, timestamp, type, currency, amount, rate, total_pyg, account,
                            to_account, profit, description, registered_by, source)
  VALUES (v_id, v_num, v_ts, p->>'type', NULLIF(p->>'currency', ''), (p->>'amount')::NUMERIC, (p->>'rate')::NUMERIC,
          (p->>'totalPYG')::NUMERIC, p->>'account', NULLIF(p->>'toAccount', ''), (r->>'profit')::NUMERIC,
          NULLIF(p->>'description', ''), NULLIF(p->>'registeredBy', ''), NULLIF(p->>'source', ''));
  RETURN jsonb_build_object('id', v_id, 'operation_number', v_num, 'timestamp', v_ts,
                            'profit', r->'profit', 'warnings', r->'warnings');
END $$;

CREATE OR REPLACE FUNCTION public.delete_operation(p_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t transactions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('micambio_ops'));
  SELECT * INTO t FROM transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM _revert_op(t);
  DELETE FROM transactions WHERE id = p_id;
  RETURN to_jsonb(t);
END $$;

CREATE OR REPLACE FUNCTION public.delete_last_operation()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('micambio_ops'));
  SELECT id INTO v_id FROM transactions ORDER BY operation_number DESC LIMIT 1;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN delete_operation(v_id);
END $$;

-- Corrige una operación: revierte la original y aplica la nueva, manteniendo número y hora.
CREATE OR REPLACE FUNCTION public.update_operation(p_id TEXT, p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t transactions; r JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('micambio_ops'));
  SELECT * INTO t FROM transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM _revert_op(t);
  r := _apply_op(p);
  UPDATE transactions SET
    type = p->>'type', currency = NULLIF(p->>'currency', ''), amount = (p->>'amount')::NUMERIC,
    rate = (p->>'rate')::NUMERIC, total_pyg = (p->>'totalPYG')::NUMERIC, account = p->>'account',
    to_account = NULLIF(p->>'toAccount', ''), profit = (r->>'profit')::NUMERIC,
    description = NULLIF(p->>'description', ''), updated_at = NOW()
  WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'operation_number', t.operation_number, 'timestamp', t.timestamp,
                            'profit', r->'profit', 'warnings', r->'warnings');
END $$;

-- Solo la service role (servidor) puede ejecutar estas funciones
REVOKE ALL ON FUNCTION public._acc_add(TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._stock_set(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_op(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._revert_op(public.transactions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_operation(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_operation(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_last_operation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_operation(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_operation(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_operation(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_last_operation() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_operation(TEXT, JSONB) TO service_role;

-- 5. Bucket privado para copias de seguridad semanales ----------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', FALSE)
ON CONFLICT (id) DO NOTHING;
