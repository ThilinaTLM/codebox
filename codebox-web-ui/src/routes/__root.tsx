import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { TooltipProvider } from "../components/ui/tooltip"
import appCss from "../styles.css?url"
import type { BoxPageActions } from "@/components/box/BoxPageContext"
import { API_URL, WS_URL } from "@/lib/constants"
import { useGlobalWebSocket } from "@/net/ws/useGlobalWebSocket"
import { ThemeProvider } from "@/components/layout/ThemeProvider"
import { TopBar } from "@/components/layout/TopBar"
import { Toaster } from "@/components/ui/sonner"
import {
  BoxPageActionsContext,
  BoxPageSetterContext,
} from "@/components/box/BoxPageContext"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
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

function GlobalWebSocketProvider({ children }: { children: React.ReactNode }) {
  useGlobalWebSocket()
  return <>{children}</>
}

function RootComponent() {
  const [boxPageActions, setBoxPageActions] = useState<BoxPageActions | null>(
    null
  )

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalWebSocketProvider>
        <ThemeProvider>
          <TooltipProvider>
            <BoxPageSetterContext value={setBoxPageActions}>
              <BoxPageActionsContext value={boxPageActions}>
                <div className="flex min-h-svh flex-col">
                  <TopBar />
                  <main className="flex-1">
                    <Outlet />
                  </main>
                </div>
                <Toaster />
              </BoxPageActionsContext>
            </BoxPageSetterContext>
          </TooltipProvider>
        </ThemeProvider>
      </GlobalWebSocketProvider>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify({ API_URL, WS_URL })}`,
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
