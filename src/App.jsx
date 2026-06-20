import { Dashboard } from './components/Dashboard'
import { FileExplorer } from './components/FileExplorer'
import { AppProvider } from './AppContext'

function App() {
  return (
    <AppProvider>
      <div className="h-screen w-screen overflow-hidden bg-bg-main text-white">
        <main className="flex h-full min-h-0 flex-col lg:flex-row">
          <aside className="min-h-0 border-b border-gray-800 bg-bg-sidebar lg:w-[380px] lg:flex-shrink-0 lg:border-b-0 lg:border-r">
            <Dashboard />
          </aside>
          <section className="min-h-0 min-w-0 flex-1">
            <FileExplorer />
          </section>
        </main>
      </div>
    </AppProvider>
  )
}

export default App
