// Shared by middleware (edge) and server actions (node): Web Crypto only.
export const AUTH_COOKIE = "aangan_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`aangan:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
