import { Dashboard } from './components/Dashboard'
import { FileExplorer } from './components/FileExplorer'
import { AppProvider } from './AppContext'

function App() {
  return (
    <AppProvider>
      <div className="h-screen w-screen flex flex-col bg-bg-main text-white overflow-hidden">
        <Dashboard />
        <FileExplorer />
      </div>
    </AppProvider>
  )
}

export default App
