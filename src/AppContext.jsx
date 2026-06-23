import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { clearAppToken, fetchAuditLog, fetchAuthStatus, fetchStatus, fetchStats, setProtocolEnabled, verifyAppToken } from './api'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [ftpEnabled, setFtpEnabled] = useState(true)
  const [webdavEnabled, setWebdavEnabled] = useState(true)
  const [protocols, setProtocols] = useState({
    ftp: { enabled: true, port: 2121, url: 'ftp://localhost:2121' },
    webdav: { enabled: true, path: '/webdav', url: 'http://localhost:4000/webdav' }
  })
  const [uploadProgress, setUploadProgress] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [transfers, setTransfers] = useState([])
  const [stats, setStats] = useState({ files: 0, folders: 0, totalSize: 0 })
  const [auditLog, setAuditLog] = useState([])
  const [authChecked, setAuthChecked] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState('')
  const cancelHandlers = useRef(new Map())

  const statusMessages = {
    disconnected: 'Отключено',
    connecting: 'Подключение...',
    connected: 'Подключено'
  }

  const checkStatus = useCallback(async () => {
    try {
      const status = await fetchStatus()
      setConnectionStatus(status.connected ? 'connected' : 'disconnected')
      if (status.protocols) {
        setProtocols(status.protocols)
        setFtpEnabled(Boolean(status.protocols.ftp?.enabled))
        setWebdavEnabled(Boolean(status.protocols.webdav?.enabled))
      }
    } catch {
      setConnectionStatus('disconnected')
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats()
      setStats(data)
    } catch {
      // бэкенд недоступен
    }
  }, [])

  const loadAuditLog = useCallback(async () => {
    try {
      const data = await fetchAuditLog(8)
      setAuditLog(data)
    } catch {
      // бэкенд недоступен
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const status = await fetchAuthStatus()
      setAuthRequired(Boolean(status.required))
      setAuthenticated(Boolean(status.authenticated))
      setAuthError('')
    } catch (error) {
      setAuthRequired(true)
      setAuthenticated(false)
      setAuthError(error.message)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!authChecked || !authenticated) return undefined
    checkStatus()
    loadStats()
    loadAuditLog()
    const interval = setInterval(() => {
      checkStatus()
      loadStats()
      loadAuditLog()
    }, 5000)
    return () => clearInterval(interval)
  }, [authChecked, authenticated, checkStatus, loadStats, loadAuditLog])

  const login = async (token) => {
    await verifyAppToken(token)
    await checkAuth()
  }

  const logout = () => {
    clearAppToken()
    setAuthenticated(!authRequired)
  }

  const toggleFtp = async () => {
    const enabled = !ftpEnabled
    setFtpEnabled(enabled)
    try {
      await setProtocolEnabled('ftp', enabled)
      await checkStatus()
      await loadAuditLog()
    } catch {
      setFtpEnabled(!enabled)
    }
  }

  const toggleWebdav = async () => {
    const enabled = !webdavEnabled
    setWebdavEnabled(enabled)
    try {
      await setProtocolEnabled('webdav', enabled)
      await checkStatus()
      await loadAuditLog()
    } catch {
      setWebdavEnabled(!enabled)
    }
  }

  const createTransfer = useCallback((transfer) => {
    const id = transfer.id
      || globalThis.crypto?.randomUUID?.()
      || `transfer_${Date.now()}_${Math.random().toString(36).slice(2)}`
    setTransfers(current => [
      {
        id,
        type: transfer.type || 'upload',
        name: transfer.name,
        size: transfer.size || 0,
        status: transfer.status || 'queued',
        progress: transfer.progress || 0,
        error: '',
        createdAt: new Date().toISOString()
      },
      ...current
    ].slice(0, 40))
    return id
  }, [])

  const updateTransfer = useCallback((id, patch) => {
    setTransfers(current => current.map(transfer => (
      transfer.id === id
        ? { ...transfer, ...patch, updatedAt: new Date().toISOString() }
        : transfer
    )))
  }, [])

  const registerTransferCancel = useCallback((id, handler) => {
    cancelHandlers.current.set(id, handler)
    return () => cancelHandlers.current.delete(id)
  }, [])

  const unregisterTransferCancel = useCallback((id) => {
    cancelHandlers.current.delete(id)
  }, [])

  const cancelTransfer = useCallback((id) => {
    const handler = cancelHandlers.current.get(id)
    if (handler) {
      updateTransfer(id, { status: 'canceling' })
      handler()
      return
    }
    updateTransfer(id, { status: 'canceled', progress: 0 })
  }, [updateTransfer])

  const clearFinishedTransfers = useCallback(() => {
    setTransfers(current => current.filter(transfer => (
      !['done', 'error', 'canceled'].includes(transfer.status)
    )))
  }, [])

  return (
    <AppContext.Provider
      value={{
        connectionStatus,
        connectionStatusText: statusMessages[connectionStatus],
        ftpEnabled,
        webdavEnabled,
        protocols,
        uploadProgress,
        downloadProgress,
        transfers,
        stats,
        auditLog,
        authChecked,
        authRequired,
        authenticated,
        authError,
        setUploadProgress,
        setDownloadProgress,
        createTransfer,
        updateTransfer,
        cancelTransfer,
        clearFinishedTransfers,
        registerTransferCancel,
        unregisterTransferCancel,
        loadStats,
        loadAuditLog,
        checkStatus,
        login,
        logout,
        toggleFtp,
        toggleWebdav
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
