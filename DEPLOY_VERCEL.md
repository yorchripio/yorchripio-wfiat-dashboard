# Migrar wfiat-dashboard de Railway a Vercel + Supabase

## Contexto
El proyecto ya usa Supabase (PostgreSQL) como base de datos. Solo se migra el hosting de Railway a Vercel. Los datos no se tocan.

---

## Pre-requisitos
- Cuenta Vercel (plan Pro recomendado para crons cada 15 min)
- Acceso al repo GitHub: `CoastTraderDev/wfiat-dashboard`
- Las env vars del entorno actual (pedir a Jorge si no las tenés)

---

## Paso 1: Crear proyecto en Vercel

1. Ir a https://vercel.com/new
2. Importar repo `CoastTraderDev/wfiat-dashboard` (branch `main`)
3. Framework: Next.js (se detecta automáticamente)
4. Root Directory: `.` (default)
5. **NO hacer deploy todavía** — primero configurar env vars

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
| `CRON_SECRET` | Vercel lo genera automaticamente para proteger cron endpoints | Production |

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

## Paso 4: Verificar Cron Jobs

El archivo `vercel.json` ya configura los crons:

```json
{
  "crons": [
    {
      "path": "/api/cron/supply-snapshot",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/refresh-pools",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

- **supply-snapshot**: Corre diariamente a las 03:00 UTC. Toma snapshot del supply de wARS y wBRL por chain.
- **refresh-pools**: Cada 15 minutos. Actualiza cache de pools GeckoTerminal.

**NOTA**: Crons cada 15 min requieren Vercel Pro. En plan Free, el minimo es 1 vez por dia.

Verificar en Vercel Dashboard → Settings → Crons que aparezcan los 2 cron jobs.

---

## Paso 5: Verificar funcionalidad

1. **Login**: Acceder al dashboard con las credenciales existentes
2. **Dashboard**: Verificar que carga datos de todos los activos
3. **PDF Report**: Descargar reporte de wARS y wCOP, verificar que genera correctamente
4. **Supply**: Verificar que muestra supply por chain
5. **Crons**: Esperar a que corran los crons y verificar en logs que funcionan

---

## Paso 6: Apagar Railway

Una vez confirmado que Vercel funciona:
1. Desactivar el deploy en Railway
2. (Opcional) mantener Railway como backup por unos dias

---

## Notas tecnicas

### PDFKit en Vercel
- `pdfkit` es CommonJS y necesita estar en `serverExternalPackages` en `next.config.ts` (ya configurado)
- Las API routes corren como serverless functions con timeout de 10s (Free) o 60s (Pro)
- La generacion de PDFs toma ~2-5 segundos, no deberia haber problemas

### Prisma en Vercel
- `postinstall: prisma generate` ya esta en package.json
- Vercel usa el output de `prisma generate` del build, no necesita acceso directo al schema en runtime

### Base de datos
- Si se conecta a la MISMA Supabase: no hay que hacer nada, los datos ya estan
- Si se crea una NUEVA Supabase:
  1. `npx prisma db push` para crear schema
  2. Migrar datos con `pg_dump` / `pg_restore` desde la Supabase original
  3. Crear usuario admin: `npm run create-admin`

### Assets soportados
- **wARS**: Collateral allocations + VCP + rendimiento + supply snapshots
- **wBRL**: CDB positions (Banco Genial) + supply snapshots
- **wMXN**: Fund positions (Banregio REGIO1)
- **wCOP**: Finandina account snapshots + Bitso balances + supply snapshots
- **wCLP**: BCI account snapshots
- **wPEN**: Buda.com balance (live API)
