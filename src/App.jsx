import { Dashboard } from './components/Dashboard'
import { FileExplorer } from './components/FileExplorer'
import { AppProvider } from './AppContext'

function App() {
  return (
    <AppProvider>
      <div className="h-dvh w-screen overflow-hidden bg-bg-main text-white">
        <main className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="min-h-0 min-w-0 w-full shrink-0 border-b border-gray-800 bg-bg-sidebar lg:h-full lg:w-[380px] lg:border-b-0 lg:border-r">
            <Dashboard />
          </aside>
          <section className="h-[70dvh] min-h-0 min-w-0 shrink-0 lg:h-auto lg:flex-1">
            <FileExplorer />
          </section>
        </main>
      </div>
    </AppProvider>
  )
}

export default App
