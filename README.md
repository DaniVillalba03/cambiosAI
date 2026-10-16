# 🏦 CambiosAI — Sistema Inteligente para Operadores Cambiarios

> Aplicación web progresiva (PWA) de control cambiario diseñada para operadores cambiarios (cambistas) en Paraguay. Permite registrar compras, ventas y gastos mediante lenguaje natural por chat o WhatsApp oficial con IA, calculando en tiempo real el Precio Promedio Ponderado de Compra (PPP) y el spread de ganancia neta.

---

## 🚀 Características Principales

- **Moneda Base:** Guaraníes (`PYG` - Gs.).
- **Divisas Operadas:** Dólares (`USD`), Reales (`BRL`), Pesos Argentinos (`ARS`) y Euros (`EUR`).
- **Cajas y Cuentas:** Efectivo en mano por moneda + bancos locales (`Ueno Bank`, `Itaú`, `Banco Familiar`, `BNF`, `Continental`).
- **Cálculo Automático de Spread (PPP):**
  - Mantiene el Precio Promedio Ponderado de Compra de cada moneda.
  - Al vender, calcula instantáneamente la ganancia cambiaria neta: `(Cotización de Venta - PPP) * Monto`.
- **Métricas Separadas:**
  - **Ganancia Cambiaria de Hoy:** Margen puro de spread (en verde).
  - **Gastos del Día:** Gastos operativos/personales (combustible, comida, etc.).
  - **Flujo Neto Final:** `Ganancia Cambiaria - Gastos`.
- **Chat Multimodal con IA:**
  - Interpreta jerga paraguaya ("palo" = 1.000.000, "mil", "lucas", bancos locales).
  - Reconoce notas de voz y fotos de comprobantes bancarios.
  - Powered by Google Gemini 2.5 Flash + fallback local de alta resiliencia.
- **Sincronización en Tiempo Real con Supabase:**
  - Las operaciones registradas vía WhatsApp se reflejan inmediatamente en la web y el celular sin recargar mediante Supabase Realtime.
- **Webhook Oficial de Meta WhatsApp Cloud API:**
  - Comandos interactivos: `"resumen"`, `"cierre"` o `"arqueo"` para reporte del día.
  - Comando `"anular"` o `"borrar ultimo"` para revertir operaciones erróneas.
  - Tarjetas de confirmación automáticas con desglose completo.
- **Ajustar Caja Inicial / Nuevo Día:** Modal intuitivo para arrancar el día con saldos y stocks reales, o vaciar pruebas.

---

## 🛠️ Stack Tecnológico

- **Framework:** Next.js (App Router) con TypeScript
- **Estilos:** Tailwind CSS + Lucide Icons (Tema oscuro fintech)
- **Gráficos:** Recharts
- **Base de Datos & Realtime:** Supabase (PostgreSQL + Realtime Channels)
- **IA:** `@google/genai` (Gemini 2.5 Flash)
- **Integración:** Meta WhatsApp Cloud API (Graph API v21.0)

---

## ⚙️ Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/DaniVillalba03/cambiosAI.git
   cd cambiosAI
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   Copia `.env.example` a `.env.local` y completa con tus credenciales:
   ```env
   GEMINI_API_KEY=tu_gemini_api_key
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key
   WHATSAPP_VERIFY_TOKEN=cambios_papa_2026
   WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
   WHATSAPP_ACCESS_TOKEN=tu_access_token
   ```

4. **Configurar Base de Datos en Supabase:**
   Ejecuta el script `supabase-schema.sql` en el SQL Editor de tu panel de Supabase.

5. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📱 Webhook de WhatsApp

- **URL de Callback:** `https://tu-dominio.com/api/whatsapp/webhook`
- **Token de Verificación:** `cambios_papa_2026`
- **Campos Webhook suscritos:** `messages`
