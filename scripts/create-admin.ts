/**
 * Crea un usuario ADMIN en la base de datos.
 * Pide email, contraseña y nombre por consola; no guarda credenciales en .env ni en código.
 *
 * Uso: npm run create-admin
 * (carga DATABASE_URL desde .env.local)
 */

import * as readline from "readline";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer ?? "")));
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const email = (await ask(rl, "Email: ")).trim().toLowerCase();
  const password = await ask(rl, "Contraseña: ");
  const name = (await ask(rl, "Nombre: ")).trim();
  rl.close();

  if (!email || !password) {
    console.error("Email y contraseña son obligatorios.");
    process.exit(1);
  }

  const displayName = name || email.split("@")[0];

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log("Ya existe un usuario con ese email:", email);
      await prisma.$disconnect();
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: displayName,
        role: "ADMIN",
      },
    });
    console.log("Usuario ADMIN creado:", email);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
