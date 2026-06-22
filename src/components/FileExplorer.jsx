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
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-bg-main">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-main">
        <div className="flex items-center gap-3 border-b border-gray-800 px-5 py-4">
          {currentFolder && (
            <button onClick={handleBack} className="rounded-md p-1 hover:bg-bg-hover">
              <ArrowLeft size={20} className="text-gray-400" />
            </button>
          )}
          <h1 className="min-w-0 truncate text-lg font-semibold text-white">
            {currentFolder ? folderName : 'Мой диск'}
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Загрузка файлов...</p>
            </div>
          ) : fileItems.length > 0 || folders.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {/* Вложенные папки */}
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 transition-all hover:border-gray-700 hover:bg-bg-hover"
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
                <div key={file.id} className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 transition-all hover:border-gray-700 hover:bg-bg-hover">
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
                {!currentFolder && <p className="text-xs mt-1">Файлы появятся после загрузки в Telegram storage</p>}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-800 bg-bg-sidebar/50 p-2 text-center">
          <p className="text-xs text-gray-500">
            {items.length > 0 ? `${items.length} элементов` : 'Ожидание данных от сервера'}
          </p>
        </div>
      </div>
    </div>
  )
}
