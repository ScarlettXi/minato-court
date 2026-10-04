export type Account = {
  id: string; provider: string; provider_user_id: string; email: string | null;
  phone: string | null; email_verified: number; notification_channel: string;
};
export type VerifiedIdentity = { provider: "chatgpt" | "supabase"; id: string; email: string | null; phone: string | null; emailVerified: boolean };

export async function resolveAccount(db: D1Database, identity: VerifiedIdentity, ownerEmail?: string): Promise<Account> {
  // Only a verified platform identity may claim the existing owner's data. The first
  // successful claim binds it permanently to that provider's stable user ID.
  const existing = await db.prepare("SELECT * FROM app_users WHERE provider=? AND provider_user_id=?")
    .bind(identity.provider, identity.id).first<Account>();
  const ownerCandidate = identity.provider === "chatgpt" && identity.emailVerified && ownerEmail
    && identity.email?.toLowerCase() === ownerEmail.toLowerCase();
  const id = existing?.id ?? (ownerCandidate ? "owner" : `${identity.provider}:${identity.id}`);
  await db.prepare(`INSERT INTO app_users(id,provider,provider_user_id,email,phone,email_verified,notification_channel)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, identity.provider, identity.id, identity.email, identity.phone, identity.emailVerified ? 1 : 0, id === "owner" ? "push" : "email").run();
  const account = await db.prepare("SELECT * FROM app_users WHERE id=? AND provider=? AND provider_user_id=?")
    .bind(id, identity.provider, identity.id).first<Account>();
  if (!account) throw new Error("账户身份不匹配，请联系网站管理员");
  await db.prepare(`UPDATE app_users SET email=?,phone=?,email_verified=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND provider=? AND provider_user_id=?`)
    .bind(identity.email, identity.phone, identity.emailVerified ? 1 : 0, id, identity.provider, identity.id).run();
  return { ...account, email:identity.email, phone:identity.phone, email_verified:identity.emailVerified ? 1 : 0 };
}

export function publicAccount(account: Account) {
  return { id:account.id, email:account.email, phone:account.phone, emailVerified:Boolean(account.email_verified),
    notificationChannel:account.notification_channel, isOwner:account.id === "owner", provider:account.provider };
}
