# Conectar Supabase a wFIAT

Los usuarios y los datos históricos (supply, colateral) se guardan en PostgreSQL en Supabase. No hay usuarios hardcodeados: el primero se crea con `npm run create-admin` (interactivo), con el seed o manualmente en Supabase.

## 1. Crear proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto.
2. Anotá la contraseña de la base de datos que te pide al crearlo.

## 2. Obtener las URLs de conexión

1. En el proyecto: **Project Settings** → **Database**.
2. En **Connection string** elegí:
   - **URI** (Transaction pooler) → esa es tu `DATABASE_URL` (puerto **6543**).
   - Para **DIRECT_URL** usá la misma URI pero con puerto **5432** (Session mode o direct).

En la práctica:
- **DATABASE_URL**: Connection pooling (Transaction), ejemplo:
  `postgresql://postgres.[PROJECT_REF]:[TU_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`
- **DIRECT_URL**: Mismo host pero puerto **5432** (sin `?pgbouncer=true`):
  `postgresql://postgres.[PROJECT_REF]:[TU_PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`

Reemplazá `[TU_PASSWORD]` por la contraseña de la DB (la que definiste al crear el proyecto). Si tiene caracteres raros, codificala en URL (ej. `@` → `%40`).

**Importante:** La `DATABASE_URL` (pooler, puerto 6543) **debe** terminar en `?pgbouncer=true`. Sin eso, al guardar snapshots desde la app puede aparecer el error *"prepared statement does not exist"*, porque PgBouncer en modo transacción no mantiene prepared statements entre consultas.

## 3. Configurar .env.local

**Importante:** Los comandos `npm run db:push`, `npm run db:migrate` y `npm run db:seed` cargan las variables desde **`.env.local`** (no desde `.env`). Dejá `DATABASE_URL` y `DIRECT_URL` ahí.

Copiá `.env.example` a `.env.local` y completá:

```env
DATABASE_URL="postgresql://postgres.xxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
AUTH_SECRET="..."   # openssl rand -base64 32
ENCRYPTION_KEY="..." # openssl rand -hex 32
# ... el resto (Sheets, RPCs)
```

## 4. Crear tablas en Supabase

Con la DB ya conectada en `.env.local`:

```bash
npm run db:push
```

O, si preferís migraciones:

```bash
npx prisma migrate dev --name init
```

Eso crea en Supabase las tablas: `users`, `supply_snapshots`, `collateral_snapshots`.

## 5. Crear el primer usuario (ej. admin@ripio.com)

**Opción recomendada – Script interactivo (sin guardar credenciales en .env)**  
No hace falta poner email ni contraseña en ningún archivo. Ejecutá:

```bash
npm run create-admin
```

El script pide por consola: **Email**, **Contraseña** y **Nombre**. Crea el usuario ADMIN en la base de datos y no guarda las credenciales en código ni en `.env`.

**Opción B – Seed (con variables en .env)**  
En `.env.local` agregá `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` y ejecutá `npm run db:seed`. Útil si querés automatizar (CI, scripts).

**Opción C – Manual en Supabase**  
En Supabase → **SQL Editor** ejecutá (reemplazá el hash por uno generado con bcrypt para tu contraseña). Solo si no usás el script interactivo:

```sql
-- Ejemplo: contraseña "TuContraseñaSegura123!" hasheada con bcrypt (cost 12)
INSERT INTO users (id, email, password_hash, name, role, totp_enabled, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@ripio.com',
  '$2a$12$...',  -- reemplazar por hash real
  'Admin Ripio',
  'ADMIN',
  false,
  true,
  now(),
  now()
);
```

Para generar el hash podés usar un script temporal con `bcrypt.hash('TuContraseñaSegura123!', 12)` o el seed con otro email y luego cambiar el email en Supabase.

## 6. Probar

1. `npm run dev`
2. Entrá a `http://localhost:3000` → te redirige a `/login`.
3. Iniciá sesión con `admin@ripio.com` y la contraseña que usaste en el seed (o la que tiene el hash en la DB).

Cuando tengas la base creada en Supabase y las URLs en `.env.local`, avisá y revisamos que todo conecte bien (migraciones, seed y login).
