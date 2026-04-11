import {
  HeadContent,
  Navigate,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { TooltipProvider } from "../components/ui/tooltip"
import appCss from "../styles.css?url"
import type { BoxPageActions } from "@/components/box/BoxPageContext"
import { useAuthStore } from "@/lib/auth"
import { API_URL } from "@/lib/constants"
import { isAuthError } from "@/net/http/api"
import { useGlobalStream } from "@/net/sse/useGlobalStream"
import { ThemeProvider } from "@/components/layout/ThemeProvider"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { Toaster } from "@/components/ui/sonner"
import {
  BoxPageActionsContext,
  BoxPageSetterContext,
} from "@/components/box/BoxPageContext"

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
  const isLoginPage = location.pathname === "/login"

  // Not authenticated and not on login page → redirect to login
  if (!isAuthenticated && !isLoginPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Navigate to="/login" />
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  // Authenticated and on login page → redirect to home
  if (isAuthenticated && isLoginPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Navigate to="/" />
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  // On login page (unauthenticated) → render just the outlet (no app shell)
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

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const [boxPageActions, setBoxPageActions] = useState<BoxPageActions | null>(
    null
  )

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStreamProvider>
        <ThemeProvider>
          <TooltipProvider>
            <BoxPageSetterContext value={setBoxPageActions}>
              <BoxPageActionsContext value={boxPageActions}>
                <div className="flex h-svh overflow-hidden">
                  <AppSidebar />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <main className="flex-1 overflow-hidden">
                      <Outlet />
                    </main>
                    <StatusBar />
                  </div>
                </div>
                <Toaster />
              </BoxPageActionsContext>
            </BoxPageSetterContext>
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
            __html: `window.__ENV__=${JSON.stringify({ API_URL })}`,
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
