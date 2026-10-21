import bcrypt from "bcrypt";
import crypto from "crypto";
import { query, pool } from "../config/db.js";

async function seed() {
  console.log("Seeding test user accounts...");
  const saltRounds = 10;
  const adminPass = await bcrypt.hash("Admin@123", saltRounds);
  const ownerPass = await bcrypt.hash("Owner@123", saltRounds);
  const viewerPass = await bcrypt.hash("Viewer@123", saltRounds);

  const users = [
    { email: "admin@vault.local", pass: adminPass, name: "System Administrator", role: "ADMIN" },
    { email: "owner@vault.local", pass: ownerPass, name: "Document Owner", role: "USER" },
    { email: "viewer@vault.local", pass: viewerPass, name: "Restricted Viewer", role: "USER" }
  ];

  for (const u of users) {
    const existing = await query("SELECT id FROM users WHERE email = ?", [u.email]);
    if (existing.length === 0) {
      await query(
        "INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), u.email, u.pass, u.name, u.role]
      );
    }
  }

  console.log("Seed successful.");
  console.log("  Admin:  admin@vault.local  / Admin@123");
  console.log("  Owner:  owner@vault.local  / Owner@123");
  console.log("  Viewer: viewer@vault.local / Viewer@123");
  await pool.end();
}

seed().catch(console.error);
