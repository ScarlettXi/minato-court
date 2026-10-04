export type PublicAccount = { id:string; email:string | null; phone:string | null; emailVerified:boolean; notificationChannel:string; isOwner:boolean; provider:string };
export type AuthCapabilities = { emailLogin:boolean; phoneLogin:boolean; emailDelivery:boolean };
export const unavailableAuth: AuthCapabilities = { emailLogin:false, phoneLogin:false, emailDelivery:false };
