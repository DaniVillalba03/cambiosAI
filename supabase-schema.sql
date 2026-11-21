-- ========================================================
-- MiCambio - Esquema de Base de Datos para Supabase
-- Ejecutá este script completo en el SQL Editor de tu proyecto Supabase.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- IMPORTANTE: después ejecutá también supabase-migration-002.sql (funciones atómicas,
-- ingresos, transferencias, confirmación de comprobantes y bucket de copias).
-- ========================================================

-- 1. Cuentas y cajas (Guaraníes y divisas)
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK')),
    currency TEXT NOT NULL CHECK (currency IN ('PYG', 'USD', 'BRL', 'ARS', 'EUR')),
    balance NUMERIC NOT NULL DEFAULT 0,
    initial_balance NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Stock y Precio Promedio Ponderado (PPP) de divisas
CREATE TABLE IF NOT EXISTS public.currency_stocks (
    currency TEXT PRIMARY KEY CHECK (currency IN ('USD', 'BRL', 'ARS', 'EUR')),
    amount NUMERIC NOT NULL DEFAULT 0,
    total_cost_pyg NUMERIC NOT NULL DEFAULT 0,
    average_cost NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Operaciones del cambista
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    operation_number INTEGER NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    type TEXT NOT NULL CHECK (type IN ('COMPRA', 'VENTA', 'GASTO')),
    currency TEXT CHECK (currency IN ('USD', 'BRL', 'ARS', 'EUR')),
    amount NUMERIC,
    rate NUMERIC,
    total_pyg NUMERIC NOT NULL,
    account TEXT NOT NULL,
    profit NUMERIC,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_timestamp_idx ON public.transactions (timestamp);
CREATE INDEX IF NOT EXISTS transactions_opnum_idx ON public.transactions (operation_number DESC);

-- 4. Mensajes de WhatsApp ya procesados (evita duplicados cuando Meta reintenta el webhook)
CREATE TABLE IF NOT EXISTS public.processed_messages (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Seguridad (RLS)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;
-- processed_messages no tiene políticas: solo la service role key (servidor) puede usarla.

-- ⚠️ La web todavía no tiene login, por eso la anon key puede leer y escribir.
--    Cualquiera con la URL de la web puede ver y modificar los datos.
DROP POLICY IF EXISTS "Permitir todo en accounts" ON public.accounts;
DROP POLICY IF EXISTS "Permitir todo en currency_stocks" ON public.currency_stocks;
DROP POLICY IF EXISTS "Permitir todo en transactions" ON public.transactions;
CREATE POLICY "Permitir todo en accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en currency_stocks" ON public.currency_stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- 6. Cuentas iniciales (en 0: cargá tus saldos reales desde la web)
INSERT INTO public.accounts (id, name, type, currency, balance, initial_balance)
VALUES
    ('Efectivo PYG', 'Efectivo PYG', 'CASH', 'PYG', 0, 0),
    ('Efectivo USD', 'Efectivo USD', 'CASH', 'USD', 0, 0),
    ('Efectivo BRL', 'Efectivo BRL', 'CASH', 'BRL', 0, 0),
    ('Efectivo ARS', 'Efectivo ARS', 'CASH', 'ARS', 0, 0),
    ('Efectivo EUR', 'Efectivo EUR', 'CASH', 'EUR', 0, 0),
    ('Ueno Bank', 'Ueno Bank', 'BANK', 'PYG', 0, 0),
    ('Itaú', 'Itaú', 'BANK', 'PYG', 0, 0),
    ('Banco Familiar', 'Banco Familiar', 'BANK', 'PYG', 0, 0),
    ('BNF', 'BNF', 'BANK', 'PYG', 0, 0),
    ('Continental', 'Continental', 'BANK', 'PYG', 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.currency_stocks (currency, amount, total_cost_pyg, average_cost)
VALUES ('USD', 0, 0, 0), ('BRL', 0, 0, 0), ('ARS', 0, 0, 0), ('EUR', 0, 0, 0)
ON CONFLICT (currency) DO NOTHING;

-- 7. Habilitar Realtime (la versión anterior usaba "DROP TABLE IF EXISTS", que no es SQL válido
--    en ALTER PUBLICATION y hacía fallar todo el bloque).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'currency_stocks', 'transactions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
