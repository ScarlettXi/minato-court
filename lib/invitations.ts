import { runtimeEnv } from "../db/tennis";
import type { Account } from "./accounts";

export const invitationRequired = () => runtimeEnv().INVITE_ONLY === "true";
const now = () => Math.floor(Date.now() / 1000);

async function tokenHash(input: unknown) {
  if (typeof input !== "string") return null;
  const token = input.trim().toUpperCase();
  if (!/^MC-[A-F0-9]{32}$/.test(token)) return null;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,"0")).join("");
}

export async function canAccessAccount(db:D1Database, userId:string) {
  if (userId === "owner" || !invitationRequired()) return true;
  return Boolean(await db.prepare("SELECT id FROM site_invitations WHERE used_by=? AND revoked_at IS NULL LIMIT 1").bind(userId).first());
}

export async function canRequestEmailCode(db:D1Database, email:string, token:unknown) {
  if (!invitationRequired()) return true;
  const existing = await db.prepare(`SELECT i.id FROM site_invitations i JOIN app_users u ON u.id=i.used_by
    WHERE lower(u.email)=? AND u.email_verified=1 AND u.provider='supabase' AND i.revoked_at IS NULL LIMIT 1`)
    .bind(email.toLowerCase()).first();
  if (existing) return true;
  const hash = await tokenHash(token);
  if (!hash) return false;
  return Boolean(await db.prepare(`SELECT id FROM site_invitations
    WHERE token_hash=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>?`).bind(hash,now()).first());
}

// Called only after the provider has verified the email. The atomic claim allows
// one new member per code, even when two users redeem it concurrently.
export async function admitAccount(db:D1Database, account:Account, token:unknown) {
  if (await canAccessAccount(db,account.id)) return true;
  if (account.provider !== "supabase" || !account.email_verified || !account.email) return false;
  const hash = await tokenHash(token);
  if (!hash) return false;
  const claimed = await db.prepare(`UPDATE site_invitations SET used_by=?,used_at=CURRENT_TIMESTAMP
    WHERE token_hash=? AND used_by IS NULL AND revoked_at IS NULL AND expires_at>? RETURNING id`)
    .bind(account.id,hash,now()).first();
  return Boolean(claimed);
}

export async function createInvitation(db:D1Database) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code = "MC-" + Array.from(bytes,byte => byte.toString(16).padStart(2,"0")).join("").toUpperCase();
  const id = crypto.randomUUID();
  const expiresAt = now() + 7 * 86400;
  await db.prepare("INSERT INTO site_invitations(id,token_hash,created_by,expires_at) VALUES(?,?,?,?)")
    .bind(id,await tokenHash(code),"owner",expiresAt).run();
  return {id,code,expiresAt};
}

export async function listInvitations(db:D1Database) {
  const rows = await db.prepare(`SELECT id,created_at,expires_at,used_at,revoked_at
    FROM site_invitations ORDER BY created_at DESC,rowid DESC LIMIT 30`).all<{
      id:string; created_at:string; expires_at:number; used_at:string|null; revoked_at:string|null;
    }>();
  return rows.results.map(row => ({id:row.id,createdAt:row.created_at,expiresAt:row.expires_at,
    status:row.revoked_at ? "revoked" : row.used_at ? "joined" : row.expires_at <= now() ? "expired" : "available"}));
}

export async function revokeInvitation(db:D1Database, id:string) {
  await db.batch([
    db.prepare("UPDATE site_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL").bind(id),
    db.prepare(`UPDATE watch_settings SET active=0,updated_at=CURRENT_TIMESTAMP
      WHERE user_id IN (SELECT used_by FROM site_invitations WHERE id=?)
      AND NOT EXISTS (SELECT 1 FROM site_invitations i WHERE i.used_by=watch_settings.user_id AND i.revoked_at IS NULL)`)
      .bind(id),
  ]);
}
