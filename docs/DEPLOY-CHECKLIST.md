# Checklist de deploy (Vercel + GitHub)

## Antes del deploy

- [ ] **Código listo**: cambios commiteados en la rama que Vercel monitorea (ej. `main`).
- [ ] **Build local OK**: `npm run build` termina sin errores.
- [ ] **Variables de entorno en Vercel**: en el proyecto de Vercel, Settings → Environment Variables, tener definidas al menos:
  - `DATABASE_URL` (pooling con `?pgbouncer=true`)
  - `DIRECT_URL` (sin pgbouncer, para migraciones)
  - `AUTH_SECRET`, `AUTH_URL` (tu URL de producción, ej. `https://tu-dominio.vercel.app`)
  - `ENCRYPTION_KEY` (2FA)
  - `NEXT_PUBLIC_ETHEREUM_RPC`, `NEXT_PUBLIC_WORLDCHAIN_RPC`, `NEXT_PUBLIC_BASE_RPC` (y opcionalmente `*_RPCS` para fallback)
  - **`CRON_SECRET`**: generar con `openssl rand -base64 32` y configurarlo en Vercel (necesario para que el cron de supply-snapshot no devuelva 401).
  - Las de Google Sheets si las usás; las de Supabase son obligatorias.
- [ ] **Migraciones**: si hay cambios en Prisma desde el último deploy, ejecutar migraciones contra la DB de producción (desde local con `DIRECT_URL` de prod, o desde un job/script seguro).

## Deploy (push a GitHub)

1. Push a la rama conectada a Vercel (normalmente `main` o `master`):
   ```bash
   git push origin main
   ```
2. Vercel hace build y deploy automático. Revisar en el dashboard que el deploy termine en éxito.

## Después del deploy

- [ ] **Cron**: en Vercel → proyecto → Settings → Crons, ver que aparezca `/api/cron/supply-snapshot` con schedule `0 3 * * *` (03:00 UTC).
- [ ] **Probar cron a mano** (opcional pero recomendado):  
  `GET https://tu-dominio.vercel.app/api/cron/supply-snapshot`  
  Header: `Authorization: Bearer <CRON_SECRET>`.  
  Debe devolver 200 y guardar un snapshot del día.
- [ ] **Dashboard**: abrir la app, ver que cargue supply, colateral e historial sin errores.
- [ ] **Backfill** (si faltan días de snapshot): ejecutar el cron manualmente o un script que llame al endpoint por cada día faltante (24/03 hasta hoy).

## Notas

- El cron **solo corre en el plan de Vercel que lo permita** (no en Hobby sin crons). Si no ves ejecuciones, revisar plan y logs.
- Si el supply falla (RPC), el cron debería no guardar snapshot (guardia `allSuccessful`); así no se contaminan datos históricos.
