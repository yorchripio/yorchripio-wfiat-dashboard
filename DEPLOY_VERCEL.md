# Migrar wfiat-dashboard de Railway a Vercel + Supabase

## Contexto
El proyecto ya usa Supabase (PostgreSQL) como base de datos. Solo se migra el hosting de Railway a Vercel. Los datos no se tocan.

---

## Pre-requisitos
- Cuenta Vercel (plan Hobby / gratuito funciona)
- Acceso al repo GitHub: `CoastTraderDev/wfiat-dashboard`
- Las env vars del entorno actual (pedir a Jorge si no las tenes)

---

## Paso 1: Crear proyecto en Vercel

1. Ir a https://vercel.com/new
2. Importar repo `CoastTraderDev/wfiat-dashboard` (branch `main`)
3. Framework: Next.js (se detecta automaticamente)
4. Root Directory: `.` (default)
5. **NO hacer deploy todavia** — primero configurar env vars

---

## Paso 2: Configurar Environment Variables

En Vercel → Settings → Environment Variables, agregar:

| Variable | Descripcion | Entornos |
|----------|------------|----------|
| `DATABASE_URL` | URL de Supabase PostgreSQL (connection pooler, port 6543) | Production, Preview |
| `DIRECT_URL` | URL directa Supabase (port 5432, para migraciones) | Production, Preview |
| `AUTH_SECRET` | Secret para NextAuth (generar con `openssl rand -base64 32`) | Production, Preview |
| `ETHEREUM_RPC` | RPC Ethereum mainnet (Infura/Alchemy) | Production, Preview |
| `BASE_RPC` | RPC Base network (Infura/Alchemy) | Production, Preview |
| `WORLDCHAIN_RPC` | RPC Worldchain (DRPC u otro) | Production, Preview |
| `GNOSIS_RPC` | RPC Gnosis chain | Production, Preview |
| `BUDA_API_KEY` | API key Buda.com (Peru, para wPEN) | Production |
| `BUDA_API_SECRET` | API secret Buda.com | Production |
| `BUDA_CL_API_KEY` | API key Buda.com Chile (para wCLP) | Production |
| `BUDA_CL_API_SECRET` | API secret Buda.com Chile | Production |
| `CRON_SECRET` | Generar uno propio con `openssl rand -hex 32`. Los cron endpoints lo validan via Bearer token | Production |

**IMPORTANTE**:
- `DATABASE_URL` debe usar el connection pooler de Supabase (port `6543`, con `?pgbouncer=true&connection_limit=1`)
- `DIRECT_URL` usa la conexion directa (port `5432`)
- Si se usa una nueva instancia de Supabase, hay que correr `npx prisma db push` para crear las tablas

---

## Paso 3: Deploy

1. Hacer deploy desde Vercel (boton "Deploy" o push a main)
2. Vercel ejecuta automaticamente:
   - `npm install` (que triggerea `postinstall` → `prisma generate`)
   - `next build`
3. Verificar que el build pase sin errores

---

## Paso 4: Cron Jobs

El archivo `vercel.json` configura los crons:

```json
{
  "crons": [
    {
      "path": "/api/cron/supply-snapshot",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/refresh-pools",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

- **supply-snapshot**: Diario a las 03:00 UTC (00:00 ART). Snapshot del supply de wARS y wBRL por chain.
- **refresh-pools**: Cada 6 horas. Actualiza cache de pools GeckoTerminal.

**Plan Hobby**: Permite maximo 2 cron jobs, minimo una vez por dia. El `0 */6 * * *` (cada 6h) es el minimo viable para pools. Los datos de pools se actualizan en cada carga de pagina de todas formas, el cron es solo para pre-calentar el cache.

Verificar en Vercel Dashboard → Settings → Crons que aparezcan los 2 cron jobs.

---

## Paso 5: Verificar funcionalidad

1. **Login**: Acceder al dashboard con las credenciales existentes
2. **Dashboard**: Verificar que carga datos de todos los activos (wARS, wBRL, wMXN, wCOP, wCLP, wPEN)
3. **PDF Report**: Descargar reporte de wARS y wCOP desde la seccion Colateral
4. **Supply**: Verificar que muestra supply por chain
5. **Crons**: Esperar a que corran y verificar en Vercel Logs que funcionan

---

## Paso 6: Apagar Railway

Una vez confirmado que Vercel funciona correctamente:
1. Desactivar el deploy en Railway
2. (Opcional) mantener Railway como backup por unos dias

---

## Notas tecnicas

### PDFKit en Vercel
- `pdfkit` es CommonJS y necesita estar en `serverExternalPackages` en `next.config.ts` (ya configurado)
- Serverless functions tienen timeout de **10 segundos** en plan Hobby
- La generacion de PDFs toma ~2-5 segundos, no deberia haber problemas
- Si un PDF tarda mas de 10s (muchos datos), se puede optimizar limitando el rango de fechas

### Prisma en Vercel
- `postinstall: prisma generate` ya esta en package.json, Vercel lo ejecuta automaticamente
- No se necesita acceso al schema en runtime, solo en build time

### Base de datos
- **Misma Supabase** (recomendado): No hay que hacer nada, los datos ya estan. Solo apuntar las env vars a la misma instancia.
- **Nueva Supabase**:
  1. Crear proyecto en Supabase
  2. Copiar las URLs de conexion (pooler + directa)
  3. `npx prisma db push` para crear las tablas
  4. Migrar datos: `pg_dump` de la original → `pg_restore` en la nueva
  5. Crear usuario admin: `npm run create-admin`

### Limites plan Hobby Vercel
- Serverless timeout: 10 segundos
- Bandwidth: 100 GB/mes
- Cron jobs: 2 maximo, minimo diario
- Builds: 6000 min/mes
- No hay password protection nativa (el dashboard tiene su propio auth con NextAuth)

### Assets soportados y fuentes de datos
| Asset | Colateral | Supply | Rendimiento |
|-------|-----------|--------|-------------|
| wARS | CollateralAllocation (FCI, cuentas remuneradas) | On-chain (ETH, WC, Base) | VCP + RendimientoHistorico |
| wBRL | WbrlCdbPosition (CDBs Banco Genial) | On-chain (ETH, WC, Base) | Calculado de CDBs |
| wMXN | WmxnFundPosition (Fondo REGIO1 Banregio) | On-chain (WC) | Del fondo |
| wCOP | WcopAccountSnapshot (Finandina) + rendimientos | On-chain (WC, Gnosis, Polygon, BSC) | Intereses remunerada |
| wCLP | WclpAccountSnapshot (BCI) | On-chain (WC) | N/A |
| wPEN | Buda.com API (live) | On-chain (WC) | N/A |
