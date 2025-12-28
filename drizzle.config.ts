import { defineConfig } from "drizzle-kit";
import 'dotenv/config'; 

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const url = new URL(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//, ''),
    // ИЗМЕНЕНИЕ: Ставим false, чтобы принимать локальные самоподписанные сертификаты
    ssl: { rejectUnauthorized: false }, 
  },
});