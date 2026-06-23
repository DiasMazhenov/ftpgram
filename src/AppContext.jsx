import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { fetchStatus, fetchStats } from './api'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [ftpEnabled, setFtpEnabled] = useState(true)
  const [webdavEnabled, setWebdavEnabled] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [transfers, setTransfers] = useState([])
  const [stats, setStats] = useState({ files: 0, folders: 0, totalSize: 0 })
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

  useEffect(() => {
    checkStatus()
    loadStats()
    const interval = setInterval(() => {
      checkStatus()
      loadStats()
    }, 5000)
    return () => clearInterval(interval)
  }, [checkStatus, loadStats])

  const toggleFtp = () => setFtpEnabled(!ftpEnabled)
  const toggleWebdav = () => setWebdavEnabled(!webdavEnabled)

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
        uploadProgress,
        downloadProgress,
        transfers,
        stats,
        setUploadProgress,
        setDownloadProgress,
        createTransfer,
        updateTransfer,
        cancelTransfer,
        clearFinishedTransfers,
        registerTransferCancel,
        unregisterTransferCancel,
        loadStats,
        checkStatus,
        toggleFtp,
        toggleWebdav
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
