/** Cloudflare Turnstile (anti-bots). Sin TURNSTILE_SECRET la comprobación se omite (local). */
export async function verificarTurnstile(secreto: string | undefined, token: string | undefined, ip: string): Promise<boolean> {
  if (!secreto) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secreto, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
