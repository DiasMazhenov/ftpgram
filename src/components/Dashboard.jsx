import React, { useState, useEffect } from 'react'
import { Globe, Server, Upload, Download, RefreshCw } from 'lucide-react'
import { useApp } from '../AppContext'

export const Dashboard = () => {
  const {
    connectionStatus,
    connectionStatusText,
    ftpEnabled,
    webdavEnabled,
    uploadProgress,
    downloadProgress,
    stats,
    checkStatus,
    toggleFtp,
    toggleWebdav
  } = useApp()

  const [statusColor, setStatusColor] = useState('text-gray-500')

  useEffect(() => {
    if (connectionStatus === 'connected') setStatusColor('text-green-500')
    else if (connectionStatus === 'connecting') setStatusColor('text-yellow-500')
    else setStatusColor('text-gray-500')
  }, [connectionStatus])

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`} />
            <h1 className="text-xl font-semibold text-white">FTPgram</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-sm font-medium ${statusColor}`}>{connectionStatusText}</span>
            <button
              onClick={checkStatus}
              className="flex items-center gap-2 px-4 py-2 bg-bg-card hover:bg-bg-hover text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              <RefreshCw size={16} className={connectionStatus === 'connecting' ? 'animate-spin' : ''} />
              Проверить
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
        <div className="bg-bg-card rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Globe className="text-blue-400" size={24} />
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Статус Telegram</h2>
                <p className="text-sm text-gray-500 mt-1">Подключение к Telegram API</p>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400' : connectionStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {connectionStatusText}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-semibold text-white">{stats.files}</div>
              <div className="text-sm text-gray-500">Файлов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-white">{stats.folders}</div>
              <div className="text-sm text-gray-500">Папок</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-white">{formatBytes(stats.totalSize)}</div>
              <div className="text-sm text-gray-500">Занято места</div>
            </div>
          </div>
        </div>

        <div className="bg-bg-card rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Server className="text-purple-400" size={24} />
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Локальный сервер</h2>
                <p className="text-sm text-gray-500 mt-1">Веб-сервер для FTP/WebDAV</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className={`p-4 rounded-lg border-2 ${ftpEnabled ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">FTP</span>
                <button
                  onClick={toggleFtp}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${ftpEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ftpEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-xs text-gray-400">{ftpEnabled ? 'Активен на порту 21' : 'Отключен'}</p>
            </div>

            <div className={`p-4 rounded-lg border-2 ${webdavEnabled ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">WebDAV</span>
                <button
                  onClick={toggleWebdav}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${webdavEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${webdavEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-xs text-gray-400">{webdavEnabled ? 'Активен на порту 80' : 'Отключен'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bg-card rounded-xl p-6 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Upload className="text-blue-400" size={24} />
                <div>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Загрузка</h2>
                  <p className="text-sm text-gray-500 mt-1">FTP/WebDAV</p>
                </div>
              </div>
              <span className="text-xl font-bold text-blue-400">
                {uploadProgress > 0 ? `${uploadProgress}%` : 'Ожидание'}
              </span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Прогресс</span>
                <span className="text-white font-medium">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>Ожидание загрузки</span>
            </div>
          </div>

          <div className="bg-bg-card rounded-xl p-6 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Download className="text-green-400" size={24} />
                <div>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Скачивание</h2>
                  <p className="text-sm text-gray-500 mt-1">FTP/WebDAV</p>
                </div>
              </div>
              <span className="text-xl font-bold text-green-400">
                {downloadProgress > 0 ? `${downloadProgress}%` : 'Ожидание'}
              </span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Прогресс</span>
                <span className="text-white font-medium">{downloadProgress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-300 ease-out" style={{ width: `${downloadProgress}%` }} />
              </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>Ожидание скачивания</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
