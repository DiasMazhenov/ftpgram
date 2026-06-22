import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Edit3, File, Folder, FolderPlus, MoveRight, Trash2 } from 'lucide-react'
import { createFolder, deleteItem, fetchFiles, fetchFolders, moveItem, renameItem } from '../api'

export const FileExplorer = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [menu, setMenu] = useState(null)
  const [touchTimer, setTouchTimer] = useState(null)

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

  const refresh = () => loadFiles(currentFolder)

  const openMenu = (event, item = null) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    const point = event.touches?.[0] || event
    setMenu({
      x: Math.min(point.clientX, window.innerWidth - 240),
      y: Math.min(point.clientY, window.innerHeight - 190),
      item
    })
  }

  const closeMenu = () => setMenu(null)

  const createFolderAction = async () => {
    closeMenu()
    const name = window.prompt('Название папки')
    if (!name?.trim()) return
    try {
      await createFolder(name, currentFolder)
      await refresh()
    } catch (error) {
      window.alert(error.message)
    }
  }

  const renameAction = async (item) => {
    closeMenu()
    const name = window.prompt('Новое название', item.name)
    if (!name?.trim() || name === item.name) return
    try {
      await renameItem(item.type, item.id, name)
      if (item.type === 'folder' && currentFolder === item.id) setFolderName(name)
      await refresh()
    } catch (error) {
      window.alert(error.message)
    }
  }

  const deleteAction = async (item) => {
    closeMenu()
    const label = item.type === 'folder' ? 'папку и все внутри нее' : 'файл'
    if (!window.confirm(`Удалить ${label} "${item.name}"?`)) return
    try {
      await deleteItem(item.type, item.id)
      await refresh()
    } catch (error) {
      window.alert(error.message)
    }
  }

  const moveAction = async (item) => {
    closeMenu()
    try {
      const folderOptions = (await fetchFolders()).filter(folder => folder.id !== item.id)
      const options = ['0. Мой диск', ...folderOptions.map((folder, index) => `${index + 1}. ${folder.name}`)]
      const choice = window.prompt(`Выбери папку назначения:\n${options.join('\n')}`, '0')
      if (choice === null) return

      const index = Number(choice)
      if (!Number.isInteger(index) || index < 0 || index > folderOptions.length) {
        window.alert('Укажи номер папки из списка')
        return
      }

      const target = index === 0 ? null : folderOptions[index - 1]
      await moveItem(item.type, item.id, target?.id || null)
      await refresh()
    } catch (error) {
      window.alert(error.message)
    }
  }

  const startLongPress = (event, item = null) => {
    const touch = event.touches[0]
    const point = { clientX: touch.clientX, clientY: touch.clientY }
    const timer = window.setTimeout(() => openMenu(point, item), 550)
    setTouchTimer(timer)
  }

  const cancelLongPress = () => {
    if (touchTimer) window.clearTimeout(touchTimer)
    setTouchTimer(null)
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
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-bg-main" onClick={closeMenu}>
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

        <div
          className="flex-1 overflow-y-auto p-4 scrollbar-thin"
          onClick={(event) => {
            if (!event.target.closest('[data-drive-item]')) openMenu(event)
          }}
          onContextMenu={(event) => openMenu(event)}
          onTouchStart={(event) => {
            if (event.target === event.currentTarget) startLongPress(event)
          }}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
        >
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
                  data-drive-item
                  className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 transition-all hover:border-gray-700 hover:bg-bg-hover"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleFolderClick(folder)
                  }}
                  onContextMenu={(event) => openMenu(event, folder)}
                  onTouchStart={(event) => startLongPress(event, folder)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
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
                <div
                  key={file.id}
                  data-drive-item
                  className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 transition-all hover:border-gray-700 hover:bg-bg-hover"
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => openMenu(event, file)}
                  onTouchStart={(event) => startLongPress(event, file)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
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
                {!currentFolder && <p className="text-xs mt-1">Нажми в рабочей области, чтобы создать папку</p>}
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

      {menu && (
        <div
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-gray-700 bg-bg-card py-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
            onClick={createFolderAction}
          >
            <FolderPlus size={16} />
            Создать папку
          </button>

          {menu.item && (
            <>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                onClick={() => renameAction(menu.item)}
              >
                <Edit3 size={16} />
                Переименовать
              </button>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                onClick={() => moveAction(menu.item)}
              >
                <MoveRight size={16} />
                Переместить
              </button>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                onClick={() => deleteAction(menu.item)}
              >
                <Trash2 size={16} />
                Удалить
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
