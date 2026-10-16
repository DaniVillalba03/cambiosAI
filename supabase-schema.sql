-- ========================================================
-- CambiosAI - Esquema de Base de Datos para Supabase
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase:
-- https://supabase.com/dashboard/project/oisxqkxekrwsftubxibj/sql
-- ========================================================

-- 1. Tabla de Cuentas y Cajas (Guaraníes y Divisas)
CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK')),
    currency TEXT NOT NULL CHECK (currency IN ('PYG', 'USD', 'BRL', 'ARS', 'EUR')),
    balance NUMERIC NOT NULL DEFAULT 0,
    initial_balance NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Asuncion', NOW())
);

-- 2. Tabla de Stock y Precio Promedio Ponderado (PPP) de Divisas
CREATE TABLE IF NOT EXISTS public.currency_stocks (
    currency TEXT PRIMARY KEY CHECK (currency IN ('USD', 'BRL', 'ARS', 'EUR')),
    amount NUMERIC NOT NULL DEFAULT 0,
    total_cost_pyg NUMERIC NOT NULL DEFAULT 0,
    average_cost NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Asuncion', NOW())
);

-- 3. Tabla de Transacciones y Operaciones del Cambista
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    operation_number INTEGER NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT TIMEZONE('America/Asuncion', NOW()),
    type TEXT NOT NULL CHECK (type IN ('COMPRA', 'VENTA', 'GASTO')),
    currency TEXT CHECK (currency IN ('USD', 'BRL', 'ARS', 'EUR')),
    amount NUMERIC,
    rate NUMERIC,
    total_pyg NUMERIC NOT NULL,
    account TEXT NOT NULL,
    profit NUMERIC,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Asuncion', NOW())
);

-- Habilitar RLS (Row Level Security) y permitir acceso con Anon Key
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo en accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en currency_stocks" ON public.currency_stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- 4. Insertar Cuentas Iniciales
INSERT INTO public.accounts (id, name, type, currency, balance, initial_balance)
VALUES
    ('Efectivo PYG', 'Efectivo PYG', 'CASH', 'PYG', 45000000, 45000000),
    ('Efectivo USD', 'Efectivo USD', 'CASH', 'USD', 0, 0),
    ('Efectivo BRL', 'Efectivo BRL', 'CASH', 'BRL', 0, 0),
    ('Efectivo ARS', 'Efectivo ARS', 'CASH', 'ARS', 0, 0),
    ('Efectivo EUR', 'Efectivo EUR', 'CASH', 'EUR', 0, 0),
    ('Ueno Bank', 'Ueno Bank', 'BANK', 'PYG', 120000000, 120000000),
    ('Itaú', 'Itaú', 'BANK', 'PYG', 85000000, 85000000),
    ('Banco Familiar', 'Banco Familiar', 'BANK', 'PYG', 30000000, 30000000),
    ('BNF', 'BNF', 'BANK', 'PYG', 15000000, 15000000),
    ('Continental', 'Continental', 'BANK', 'PYG', 10000000, 10000000)
ON CONFLICT (id) DO NOTHING;

-- 5. Insertar Stocks Iniciales
INSERT INTO public.currency_stocks (currency, amount, total_cost_pyg, average_cost)
VALUES
    ('USD', 0, 0, 0),
    ('BRL', 0, 0, 0),
    ('ARS', 0, 0, 0),
    ('EUR', 0, 0, 0)
ON CONFLICT (currency) DO NOTHING;

-- 6. Habilitar Realtime en Supabase para sincronización instantánea
BEGIN;
  -- Remover si ya existen en la publicación para evitar duplicados
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.accounts;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.currency_stocks;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.transactions;

  -- Agregar tablas a la publicación de tiempo real
  ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.currency_stocks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
COMMIT;
