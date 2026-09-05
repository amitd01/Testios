import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = { parentId?: string };

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? '',
  cookieName: 'carpool_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days — parents check this daily, re-entering a PIN weekly is friction
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

/** Returns the logged-in parent's id, or null. Every API route gates on this. */
export async function getSessionParentId(): Promise<string | null> {
  const session = await getSession();
  return session.parentId ?? null;
}
