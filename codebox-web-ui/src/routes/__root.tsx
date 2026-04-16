import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect } from "react"
import { TooltipProvider } from "../components/ui/tooltip"
import appCss from "../styles.css?url"
import { useAuthStore } from "@/lib/auth"
import { API_URL } from "@/lib/constants"
import { api, isAuthError } from "@/net/http/api"
import { useGlobalStream } from "@/net/sse/useGlobalStream"
import { ThemeProvider } from "@/components/layout/ThemeProvider"
import { Toaster } from "@/components/ui/sonner"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: (failureCount, error) =>
        !isAuthError(error) && failureCount < 2,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Codebox" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: ({ location }) => {
    // Auth redirects are expressed as route-level redirects instead of a
    // <Navigate /> rendered inside the component tree.  Rendering <Navigate>
    // from the root component leaves the server emitting a completed SSR
    // match for the current route (with an empty match id for the index
    // route), which then deadlocks client hydration for `/` specifically.
    //
    // Auth state lives in localStorage/Zustand, so it's only readable on the
    // client.  We skip SSR here and let the client-side route load handle
    // the redirect during hydration.
    if (typeof window === "undefined") return

    const isAuthenticated = useAuthStore.getState().isAuthenticated
    const isLoginPage = location.pathname === "/login"

    if (!isAuthenticated && !isLoginPage) {
      throw redirect({ to: "/login" })
    }
    if (isAuthenticated && isLoginPage) {
      throw redirect({ to: "/" })
    }
  },
  shellComponent: RootDocument,
  component: RootComponent,
})

function GlobalStreamProvider({ children }: { children: React.ReactNode }) {
  useGlobalStream()
  return <>{children}</>
}

function RootComponent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  const navigate = useNavigate()
  const isLoginPage = location.pathname === "/login"

  // Validate the auth cookie is still valid on initial load.
  useEffect(() => {
    if (isAuthenticated) {
      api.auth.me().catch(() => {
        useAuthStore.getState().logout()
      })
    }
  }, [isAuthenticated])

  // Client-side auth redirects.  The route's `beforeLoad` handles this for
  // soft navigations, but it can't fire on the server (auth state lives in
  // localStorage/Zustand) — so hard reloads hit this effect during
  // hydration.
  useEffect(() => {
    if (!isAuthenticated && !isLoginPage) {
      void navigate({ to: "/login", replace: true })
    } else if (isAuthenticated && isLoginPage) {
      void navigate({ to: "/", replace: true })
    }
  }, [isAuthenticated, isLoginPage, navigate])

  // Unauthenticated (i.e. on /login) → render the outlet without the
  // authenticated-only providers or app shell.
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Outlet />
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  // Authenticated: providers only; layout routes render their own shells.
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStreamProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Outlet />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </GlobalStreamProvider>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify({
              CODEBOX_API_URL:
                (import.meta.env.SSR
                  ? process.env.CODEBOX_API_URL
                  : undefined) || API_URL,
            })}`,
          }}
        />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
