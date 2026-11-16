import { Router } from 'express';
import type { Request, Response } from 'express';
import { HttpError, jsonObject } from '../http';
import { sessionCookie, sessionDuration } from './auth.service';
import type { AuthService } from './auth.service';

export function createAuthRouter(
  auth: AuthService,
  sessionEnded?: (id: string) => void,
) {
  const router = Router();
  const attempts = new Map<string, number>();
  let windowEnds = 0;

  function rateLimit(request: Request) {
    const now = Date.now();
    if (now >= windowEnds) {
      attempts.clear();
      windowEnds = now + 60_000;
    }
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const count = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, count);
    if (count > 20)
      throw new HttpError(429, 'Too many attempts. Try again in a minute.');
  }

  function cookieOptions(request: Request) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: request.secure,
      path: '/',
    };
  }

  async function revokePrevious(request: Request) {
    const id = await auth.revoke(request.headers.cookie);
    if (id) sessionEnded?.(id);
  }

  async function startSession(
    profileId: string,
    request: Request,
    response: Response,
    status: number,
  ) {
    const token = await auth.issue(profileId);
    await revokePrevious(request);
    response.cookie(sessionCookie, token, {
      ...cookieOptions(request),
      maxAge: sessionDuration,
    });
    response.status(status).json({ signedIn: true });
  }

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/signup', async (request, response) => {
    rateLimit(request);
    await startSession(
      await auth.signup(jsonObject(request.body)),
      request,
      response,
      201,
    );
  });
  router.post('/login', async (request, response) => {
    rateLimit(request);
    await startSession(
      await auth.login(jsonObject(request.body)),
      request,
      response,
      200,
    );
  });
  router.get('/session', async (request, response) => {
    const { profile } = await auth.requireSession(request.headers.cookie);
    const { name, username, email } = await auth.account(profile);
    response.json({ name, username, email });
  });
  router.post('/logout', async (request, response) => {
    await revokePrevious(request);
    response.clearCookie(sessionCookie, cookieOptions(request));
    response.json({ signedIn: false });
  });
  return router;
}
