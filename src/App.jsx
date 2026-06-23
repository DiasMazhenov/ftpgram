import { Dashboard } from './components/Dashboard'
import { FileExplorer } from './components/FileExplorer'
import { AppProvider, useApp } from './AppContext'
import { useState } from 'react'

function LoginScreen() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, authError } = useApp()

  const submit = async (event) => {
    event.preventDefault()
    if (!token.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await login(token.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg-main px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-gray-800 bg-bg-card p-5 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <img src="/ftpgram.svg" alt="" className="size-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-white">FTPgram</h1>
            <p className="mt-0.5 text-xs text-gray-500">Локальный вход</p>
          </div>
        </div>
        <label className="block text-sm font-medium text-gray-300" htmlFor="ftpgram-token">
          Ключ доступа
        </label>
        <input
          id="ftpgram-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="mt-2 h-10 w-full rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-white outline-none focus:border-accent-primary"
          autoFocus
        />
        {(error || authError) && (
          <p className="mt-3 text-sm text-red-300">{error || authError}</p>
        )}
        <button
          type="submit"
          disabled={submitting || !token.trim()}
          className="mt-5 h-10 w-full rounded-md bg-accent-primary text-sm font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Проверка...' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

function AppShell() {
  const { authChecked, authRequired, authenticated } = useApp()

  if (!authChecked) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-main text-sm text-gray-400">
        Загрузка FTPgram...
      </div>
    )
  }

  if (authRequired && !authenticated) return <LoginScreen />

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <aside className="min-h-0 min-w-0 w-full shrink-0 border-b border-gray-800 bg-bg-sidebar lg:h-full lg:w-[380px] lg:border-b-0 lg:border-r">
        <Dashboard />
      </aside>
      <section className="h-[70dvh] min-h-0 min-w-0 shrink-0 lg:h-auto lg:flex-1">
        <FileExplorer />
      </section>
    </main>
  )
}

function App() {
  return (
    <AppProvider>
      <div className="h-dvh w-screen overflow-hidden bg-bg-main text-white">
        <AppShell />
      </div>
    </AppProvider>
  )
}

export default App
