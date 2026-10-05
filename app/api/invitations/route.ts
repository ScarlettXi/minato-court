import { getTennisDb } from "../../../db/tennis";
import { AuthError, authCapabilities, authContext, authFailure, authJson, rateLimit, requireSameOrigin, type AuthContext } from "../../../lib/auth";
import { createInvitation, listInvitations, revokeInvitation } from "../../../lib/invitations";

async function owner(request:Request) {
  const context = await authContext(request);
  if (context.account.id !== "owner") throw new AuthError("只有站点所有者可以管理邀请",403);
  return context;
}

export async function GET(request:Request) {
  let context:AuthContext|undefined;
  try {
    context = await owner(request);
    return authJson({invitations:await listInvitations(getTennisDb())},context);
  } catch(error) {return authFailure(error,context);}
}

export async function POST(request:Request) {
  let context:AuthContext|undefined;
  try {
    requireSameOrigin(request);
    context = await owner(request);
    const body = await request.json() as Record<string,unknown>;
    const db = getTennisDb();
    if (body.action === "create") {
      const capabilities = authCapabilities();
      if (!capabilities.inviteOnly || !capabilities.emailLogin) throw new AuthError("邀请邮箱登录尚未开通",503);
      await rateLimit(request,"create-invitation",context.account.id,20,3600);
      const invitation = await createInvitation(db);
      return authJson({invitation,invitations:await listInvitations(db)},context);
    }
    if (body.action === "revoke" && typeof body.id === "string" && body.id.length <= 64) {
      await revokeInvitation(db,body.id);
      return authJson({ok:true,invitations:await listInvitations(db)},context);
    }
    throw new AuthError("未知操作",400);
  } catch(error) {return authFailure(error,context);}
}
