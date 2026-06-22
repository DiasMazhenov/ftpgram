import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchStatus, fetchStats } from './api'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [ftpEnabled, setFtpEnabled] = useState(true)
  const [webdavEnabled, setWebdavEnabled] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [stats, setStats] = useState({ files: 0, folders: 0, totalSize: 0 })

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

  return (
    <AppContext.Provider
      value={{
        connectionStatus,
        connectionStatusText: statusMessages[connectionStatus],
        ftpEnabled,
        webdavEnabled,
        uploadProgress,
        downloadProgress,
        stats,
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
