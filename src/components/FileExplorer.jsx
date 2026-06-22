import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  Download,
  Edit3,
  File,
  Folder,
  FolderPlus,
  Images,
  LayoutGrid,
  List,
  MoveRight,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import {
  createFolder,
  deleteItem,
  downloadItem,
  fetchFiles,
  fetchFolders,
  getFileUrl,
  moveItem,
  renameItem,
  uploadFile
} from '../api'
import { useApp } from '../AppContext'

export const FileExplorer = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [menu, setMenu] = useState(null)
  const [touchTimer, setTouchTimer] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('icons')
  const [sortBy, setSortBy] = useState('name')
  const [sortDescending, setSortDescending] = useState(false)
  const fileInputRef = useRef(null)
  const dragDepth = useRef(0)
  const { setUploadProgress, loadStats } = useApp()
  const isSystemFolder = (item) => ['telegram_saved_messages', 'telegram_storage'].includes(item?.id)

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

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || uploading) return

    closeMenu()
    setUploading({ current: 0, total: files.length, name: files[0].name, progress: 0 })
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        setUploading({ current: index + 1, total: files.length, name: file.name, progress: 0 })
        await uploadFile(file, currentFolder, fileProgress => {
          const totalProgress = ((index + fileProgress) / files.length) * 100
          setUploadProgress(Math.round(totalProgress))
          setUploading({
            current: index + 1,
            total: files.length,
            name: file.name,
            progress: Math.round(fileProgress * 100)
          })
        })
      }
      await Promise.all([refresh(), loadStats()])
    } catch (error) {
      window.alert(error.message)
    } finally {
      setUploading(null)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openFilePicker = () => {
    closeMenu()
    fileInputRef.current?.click()
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    dragDepth.current += 1
    if (event.dataTransfer?.types.includes('Files')) setIsDragging(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragging(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    uploadFiles(event.dataTransfer.files)
  }

  const openMenu = (event, item = null) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    const point = event.touches?.[0] || event
    setMenu({
      x: Math.min(point.clientX, window.innerWidth - 240),
      y: Math.min(point.clientY, window.innerHeight - 280),
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

  const downloadAction = (item) => {
    closeMenu()
    downloadItem(item.id)
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

  const formatDate = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return new Intl.DateTimeFormat('ru', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date)
  }

  const getItemType = (item) => {
    if (item.type === 'folder') return 'Папка'
    const extension = item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : ''
    return extension || item.mime_type || 'Файл'
  }

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru')
    const filtered = normalizedQuery
      ? items.filter(item => item.name.toLocaleLowerCase('ru').includes(normalizedQuery))
      : items

    const valueFor = (item) => {
      if (sortBy === 'date_added') return new Date(item.date_added || 0).getTime()
      if (sortBy === 'date_modified') return new Date(item.date_modified || 0).getTime()
      if (sortBy === 'date_created') return new Date(item.date_created || 0).getTime()
      if (sortBy === 'type') return getItemType(item)
      if (sortBy === 'size') return item.size || 0
      return item.name
    }

    return [...filtered].sort((first, second) => {
      if (first.type !== second.type) return first.type === 'folder' ? -1 : 1
      const firstValue = valueFor(first)
      const secondValue = valueFor(second)
      const result = typeof firstValue === 'string'
        ? firstValue.localeCompare(secondValue, 'ru', { numeric: true, sensitivity: 'base' })
        : firstValue - secondValue
      return sortDescending ? -result : result
    })
  }, [items, query, sortBy, sortDescending])

  const folders = visibleItems.filter(item => item.type === 'folder')
  const fileItems = visibleItems.filter(item => item.type === 'file')
  const ViewIcon = viewMode === 'table' ? List : viewMode === 'gallery' ? Images : LayoutGrid

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-bg-main" onClick={closeMenu}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-main">
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {currentFolder && (
              <button onClick={handleBack} className="rounded-md p-1 hover:bg-bg-hover" title="Назад">
                <ArrowLeft size={20} className="text-gray-400" />
              </button>
            )}
            <h1 className="min-w-0 truncate text-lg font-semibold text-white">
              {currentFolder ? folderName : 'Мой диск'}
            </h1>
          </div>
          <button
            onClick={openFilePicker}
            disabled={Boolean(uploading)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Загрузить</span>
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-2 border-b border-gray-800 px-4 py-3 sm:flex sm:flex-wrap">
          <label className="relative col-span-3 w-full sm:col-span-1 sm:min-w-[180px] sm:flex-1">
            <span className="sr-only">Поиск файлов</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск файлов"
              className="h-9 w-full rounded-md border border-gray-700 bg-bg-card pl-9 pr-9 text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-bg-hover hover:text-gray-200"
                aria-label="Очистить поиск"
              >
                <X size={15} />
              </button>
            )}
          </label>

          <label className="relative min-w-0 sm:min-w-fit">
            <span className="sr-only">Вид файлов</span>
            <ViewIcon
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value)}
              className="h-9 w-full appearance-none rounded-md border border-gray-700 bg-bg-card pl-9 pr-8 text-sm text-gray-200 outline-none hover:bg-bg-hover focus:border-blue-500 sm:w-auto"
              title="Вид"
            >
              <option value="table">Таблица</option>
              <option value="icons">Значки</option>
              <option value="gallery">Галерея</option>
            </select>
          </label>

          <label className="relative min-w-0">
            <span className="sr-only">Сортировка файлов</span>
            <ArrowUpDown
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <select
              value={sortBy}
              onChange={(event) => {
                const value = event.target.value
                setSortBy(value)
                setSortDescending(value.startsWith('date_'))
              }}
              className="h-9 w-full appearance-none truncate rounded-md border border-gray-700 bg-bg-card pl-9 pr-8 text-sm text-gray-200 outline-none hover:bg-bg-hover focus:border-blue-500 sm:max-w-[190px]"
              title="Сортировка"
            >
              <option value="date_added">По дате добавления</option>
              <option value="date_modified">По дате изменения</option>
              <option value="date_created">По дате создания</option>
              <option value="name">По имени</option>
              <option value="type">По типу файла</option>
              <option value="size">По размеру файла</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setSortDescending(value => !value)}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-bg-card text-gray-400 hover:bg-bg-hover hover:text-white"
            aria-label={sortDescending ? 'Сортировать по возрастанию' : 'Сортировать по убыванию'}
            title={sortDescending ? 'По убыванию' : 'По возрастанию'}
          >
            <ArrowUpDown size={16} className={sortDescending ? 'rotate-180' : ''} />
          </button>
        </div>

        <div
          className={`relative flex-1 overflow-y-auto p-4 scrollbar-thin ${isDragging ? 'bg-blue-500/5' : ''}`}
          onClick={(event) => {
            if (!event.target.closest('[data-drive-item]')) openMenu(event)
          }}
          onContextMenu={(event) => openMenu(event)}
          onTouchStart={(event) => {
            if (event.target === event.currentTarget) startLongPress(event)
          }}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => uploadFiles(event.target.files)}
          />

          {isDragging && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-bg-main/90">
              <div className="text-center text-blue-200">
                <Upload size={44} className="mx-auto mb-3" />
                <p className="font-medium">Отпусти файлы для загрузки</p>
                <p className="mt-1 text-xs text-gray-400">
                  {currentFolder ? `В папку «${folderName}»` : 'В FTPgram Storage'}
                </p>
              </div>
            </div>
          )}

          {uploading && (
            <div className="sticky top-0 z-10 mb-4 rounded-md border border-blue-500/40 bg-bg-card p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-200">{uploading.name}</span>
                <span className="shrink-0 text-blue-300">
                  {uploading.current}/{uploading.total} · {uploading.progress}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                <div className="h-full bg-blue-500" style={{ width: `${uploading.progress}%` }} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Загрузка файлов...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            viewMode === 'table' ? (
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <div className="grid grid-cols-[minmax(180px,1fr)_110px_90px_120px] gap-3 border-b border-gray-800 bg-bg-card px-4 py-2 text-xs font-medium text-gray-500 max-md:grid-cols-[minmax(160px,1fr)_90px]">
                  <span>Название</span>
                  <span className="max-md:hidden">Тип</span>
                  <span>Размер</span>
                  <span className="max-md:hidden">Изменен</span>
                </div>
                {visibleItems.map(item => (
                  <div
                    key={item.id}
                    data-drive-item
                    className="grid min-h-12 cursor-pointer grid-cols-[minmax(180px,1fr)_110px_90px_120px] items-center gap-3 border-b border-gray-800 px-4 py-2 text-sm last:border-b-0 hover:bg-bg-hover max-md:grid-cols-[minmax(160px,1fr)_90px]"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (item.type === 'folder') handleFolderClick(item)
                    }}
                    onDoubleClick={() => item.type === 'file' && downloadAction(item)}
                    onContextMenu={(event) => openMenu(event, item)}
                    onTouchStart={(event) => startLongPress(event, item)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.type === 'folder'
                        ? <Folder className="shrink-0 text-yellow-400" size={20} />
                        : <File className="shrink-0 text-gray-400" size={20} />}
                      <span className="truncate text-gray-200" title={item.name}>{item.name}</span>
                    </div>
                    <span className="truncate text-xs text-gray-500 max-md:hidden">{getItemType(item)}</span>
                    <span className="text-xs tabular-nums text-gray-500">
                      {item.type === 'folder' ? '—' : formatSize(item.size)}
                    </span>
                    <span className="text-xs tabular-nums text-gray-500 max-md:hidden">
                      {formatDate(item.date_modified)}
                    </span>
                  </div>
                ))}
              </div>
            ) : viewMode === 'gallery' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {folders.map(folder => (
                  <div
                    key={folder.id}
                    data-drive-item
                    className="min-w-0 cursor-pointer overflow-hidden rounded-lg border border-gray-800 bg-bg-card hover:border-gray-700 hover:bg-bg-hover"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleFolderClick(folder)
                    }}
                    onContextMenu={(event) => openMenu(event, folder)}
                    onTouchStart={(event) => startLongPress(event, folder)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="flex aspect-video items-center justify-center bg-gray-900">
                      <Folder className="text-yellow-400" size={52} />
                    </div>
                    <div className="truncate px-3 py-2 text-sm font-medium text-gray-200" title={folder.name}>
                      {folder.name}
                    </div>
                  </div>
                ))}
                {fileItems.map(file => (
                  <div
                    key={file.id}
                    data-drive-item
                    className="min-w-0 cursor-pointer overflow-hidden rounded-lg border border-gray-800 bg-bg-card hover:border-gray-700 hover:bg-bg-hover"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={() => downloadAction(file)}
                    onContextMenu={(event) => openMenu(event, file)}
                    onTouchStart={(event) => startLongPress(event, file)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="flex aspect-video items-center justify-center overflow-hidden bg-gray-900">
                      {file.mime_type?.startsWith('image/') ? (
                        <img
                          src={getFileUrl(file.id, true)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <File className="text-gray-400" size={52} />
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <div className="truncate text-sm font-medium text-gray-200" title={file.name}>{file.name}</div>
                      <div className="mt-1 text-xs tabular-nums text-gray-500">{formatSize(file.size)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                {folders.map(folder => (
                  <div
                    key={folder.id}
                    data-drive-item
                    className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 hover:border-gray-700 hover:bg-bg-hover"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleFolderClick(folder)
                    }}
                    onContextMenu={(event) => openMenu(event, folder)}
                    onTouchStart={(event) => startLongPress(event, folder)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="mb-3 flex justify-center">
                      <Folder className="text-yellow-400" size={40} />
                    </div>
                    <div className="truncate text-center text-sm font-medium" title={folder.name}>{folder.name}</div>
                  </div>
                ))}
                {fileItems.map(file => (
                  <div
                    key={file.id}
                    data-drive-item
                    className="min-w-0 cursor-pointer rounded-lg border border-transparent bg-bg-card p-4 hover:border-gray-700 hover:bg-bg-hover"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={() => downloadAction(file)}
                    onContextMenu={(event) => openMenu(event, file)}
                    onTouchStart={(event) => startLongPress(event, file)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="mb-3 flex justify-center">
                      <File className="text-gray-400" size={40} />
                    </div>
                    <div className="truncate text-center text-sm font-medium" title={file.name}>{file.name}</div>
                    <div className="mt-1 text-center text-xs tabular-nums text-gray-500">{formatSize(file.size)}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={48} className="mx-auto mb-2 opacity-50" />
                <p>{query ? 'Ничего не найдено' : currentFolder ? 'Папка пуста' : 'Нет файлов'}</p>
                {query ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setQuery('')
                    }}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Очистить поиск
                  </button>
                ) : !currentFolder && (
                  <p className="mt-1 text-xs">Нажми в рабочей области, чтобы создать папку</p>
                )}
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
          <button
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
            onClick={openFilePicker}
          >
            <Upload size={16} />
            Загрузить файлы
          </button>

          {menu.item?.type === 'file' && (
            <button
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
              onClick={() => downloadAction(menu.item)}
            >
              <Download size={16} />
              Скачать
            </button>
          )}

          {menu.item && !isSystemFolder(menu.item) && (
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
