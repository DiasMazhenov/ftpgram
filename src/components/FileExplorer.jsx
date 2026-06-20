import React, { useState, useEffect, useCallback } from 'react'
import { Folder, File, ArrowLeft } from 'lucide-react'
import { fetchFiles } from '../api'

export const FileExplorer = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState(null)
  const [folderName, setFolderName] = useState('')

  const loadFiles = useCallback(async (folderId = null) => {
    setLoading(true)
    try {
      const data = await fetchFiles(folderId)
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles(currentFolder)
    const interval = setInterval(() => loadFiles(currentFolder), 15000)
    return () => clearInterval(interval)
  }, [currentFolder, loadFiles])

  const handleFolderClick = (folder) => {
    setCurrentFolder(folder.id)
    setFolderName(folder.name)
  }

  const handleBack = () => {
    setCurrentFolder(null)
    setFolderName('')
  }

  const getFileIcon = (type) => {
    if (type === 'folder') return <Folder className="text-yellow-400" size={40} />
    return <File className="text-gray-400" size={40} />
  }

  const formatSize = (size) => {
    if (!size || size === 0) return ''
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(size) / Math.log(k))
    return (size / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const folders = items.filter(f => f.type === 'folder')
  const fileItems = items.filter(f => f.type === 'file')

  return (
    <div className="flex h-full bg-bg-sidebar border-r border-gray-800">
      <div className="w-64 bg-bg-sidebar flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Чаты и папки</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Загрузка...</div>
          ) : (
            folders.map(folder => (
              <div
                key={folder.id}
                className={`flex items-center gap-2 py-1.5 px-2 hover:bg-bg-hover cursor-pointer rounded-md ${currentFolder === folder.id ? 'bg-bg-hover' : ''}`}
                onClick={() => handleFolderClick(folder)}
              >
                <Folder className="text-yellow-400" size={18} />
                <span className="text-sm truncate">{folder.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-bg-main">
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          {currentFolder && (
            <button onClick={handleBack} className="p-1 hover:bg-bg-hover rounded-md">
              <ArrowLeft size={20} className="text-gray-400" />
            </button>
          )}
          <h1 className="text-lg font-semibold text-white">
            {currentFolder ? folderName : 'Файлы из Telegram'}
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Загрузка файлов...</p>
            </div>
          ) : fileItems.length > 0 || folders.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
              {/* Вложенные папки */}
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="bg-bg-card hover:bg-bg-hover rounded-lg p-4 cursor-pointer transition-all border border-transparent hover:border-gray-700"
                  onClick={() => handleFolderClick(folder)}
                >
                  <div className="flex justify-center mb-3">
                    <Folder className="text-yellow-400" size={40} />
                  </div>
                  <div className="text-sm font-medium text-center truncate" title={folder.name}>
                    {folder.name}
                  </div>
                </div>
              ))}
              {/* Файлы */}
              {fileItems.map(file => (
                <div key={file.id} className="bg-bg-card hover:bg-bg-hover rounded-lg p-4 cursor-pointer transition-all border border-transparent hover:border-gray-700">
                  <div className="flex justify-center mb-3">
                    <File className="text-gray-400" size={40} />
                  </div>
                  <div className="text-sm font-medium text-center truncate" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-500 text-center mt-1">
                    {formatSize(file.size)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={48} className="mx-auto mb-2 opacity-50" />
                <p>{currentFolder ? 'Папка пуста' : 'Нет файлов'}</p>
                {!currentFolder && <p className="text-xs mt-1">Выберите чат слева</p>}
              </div>
            </div>
          )}
        </div>

        <div className="p-2 border-t border-gray-800 bg-bg-sidebar/50 text-center">
          <p className="text-xs text-gray-500">
            {items.length > 0 ? `${items.length} элементов` : 'Ожидание данных от сервера'}
          </p>
        </div>
      </div>
    </div>
  )
}
