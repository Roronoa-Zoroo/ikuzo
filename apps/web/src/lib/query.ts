import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "api";

import { ENV } from "../env.ts";
import { toastError } from "./toast.ts";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
    mutationCache: new MutationCache({
      onError: toastError,
    }),
  });
}

export function clearSessionCache(queryClient: QueryClient) {
  queryClient.clear();
}

export function createTrpcClient(queryClient: QueryClient) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        async fetch(input, init) {
          const response = await globalThis.fetch(input, { ...init, credentials: "include" });

          if (response.status === 401) {
            queryClient.clear();
            window.location.assign("/login");
          }

          return response;
        },
        url: `${ENV.VITE_API_URL}/trpc`,
      }),
    ],
  });
}
