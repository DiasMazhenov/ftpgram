import { Dashboard } from './components/Dashboard'
import { FileExplorer } from './components/FileExplorer'
import { AppProvider } from './AppContext'

function App() {
  return (
    <AppProvider>
      <div className="h-screen w-screen flex flex-col bg-bg-main text-white">
        <div className="flex-shrink-0">
          <Dashboard />
        </div>
        <div className="flex-1 min-h-0">
          <FileExplorer />
        </div>
      </div>
    </AppProvider>
  )
}

export default App
