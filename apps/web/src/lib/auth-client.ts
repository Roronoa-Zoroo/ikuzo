import { createAuthClient } from "better-auth/react";
import { ENV } from "../env.ts";

export const authClient = createAuthClient({
  baseURL: ENV.VITE_API_URL,
});
