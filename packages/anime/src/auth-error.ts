/** The service rejected the sign-in token (expired or revoked): the user has to sign in again. */
export class AuthError extends Error {
  constructor(service: string) {
    super(`${service} sign-in expired or was revoked. Connect the account again in Settings.`);
    this.name = "AuthError";
  }
}
