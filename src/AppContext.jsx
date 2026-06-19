import React, { createContext, useContext, useState, useEffect } from 'react'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [ftpEnabled, setFtpEnabled] = useState(false)
  const [webdavEnabled, setWebdavEnabled] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const statusMessages = {
    disconnected: 'Отключено',
    connecting: 'Подключение...',
    connected: 'Подключено'
  }

  const startConnectionSimulation = () => {
    setConnectionStatus('connecting')
    setTimeout(() => {
      setConnectionStatus('connected')
    }, 2000)
  }

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
        startConnectionSimulation,
        toggleFtp,
        toggleWebdav
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
