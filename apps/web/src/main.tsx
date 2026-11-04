import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { RouteError } from "@/components/route-fallback";
import "./env.ts";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const router = createRouter({
  defaultErrorComponent: RouteError,
  defaultPreload: "intent",
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element #app was not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
