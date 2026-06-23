import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  Edit3,
  ExternalLink,
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
  deleteForever,
  downloadItem,
  emptyTrash,
  fetchFiles,
  fetchFolders,
  fetchTrash,
  getFileUrl,
  isOfficeFile,
  moveItem,
  openInGoogleDocs,
  renameItem,
  restoreItem,
  uploadFile
} from '../api'
import { useApp } from '../AppContext'
import { FilePreview } from './FilePreview'

export const FileExplorer = () => {
  const TRASH_FOLDER_ID = 'virtual_trash'
  const STORAGE_FOLDER_ID = 'telegram_storage'
  const STORAGE_TELEGRAM_URL = 'https://t.me/+DrEAy7KMU-A4ZWYy'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [folderPath, setFolderPath] = useState([])
  const [menu, setMenu] = useState(null)
  const [touchTimer, setTouchTimer] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('table')
  const [sortBy, setSortBy] = useState('name')
  const [sortDescending, setSortDescending] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const fileInputRef = useRef(null)
  const dragDepth = useRef(0)
  const longPressTriggered = useRef(false)
  const uploadCancelState = useRef(new Map())
  const {
    setUploadProgress,
    setDownloadProgress,
    createTransfer,
    updateTransfer,
    registerTransferCancel,
    unregisterTransferCancel,
    loadAuditLog,
    loadStats
  } = useApp()
  const isSystemFolder = (item) => ['telegram_saved_messages', STORAGE_FOLDER_ID, TRASH_FOLDER_ID].includes(item?.id)
  const isTrash = currentFolder === TRASH_FOLDER_ID

  const loadFiles = useCallback(async (folderId = null) => {
    setLoading(true)
    try {
      const data = folderId === TRASH_FOLDER_ID ? await fetchTrash() : await fetchFiles(folderId)
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

  useEffect(() => {
    setSelectedIds([])
  }, [currentFolder])

  useEffect(() => {
    const itemIds = new Set(items.map(item => item.id))
    setSelectedIds(ids => ids.filter(id => itemIds.has(id)))
  }, [items])

  useEffect(() => () => {
    for (const state of uploadCancelState.current.values()) {
      state.canceled = true
      state.controller?.abort()
    }
  }, [])

  const handleFolderClick = (folder) => {
    if (folder.id === TRASH_FOLDER_ID) {
      setCurrentFolder(TRASH_FOLDER_ID)
      setFolderName('Корзина')
      setFolderPath([{ id: TRASH_FOLDER_ID, name: 'Корзина' }])
      return
    }
    setCurrentFolder(folder.id)
    setFolderName(folder.name)
    setFolderPath(path => {
      const existingIndex = path.findIndex(item => item.id === folder.id)
      if (existingIndex >= 0) return path.slice(0, existingIndex + 1)
      return [...path, { id: folder.id, name: folder.name }]
    })
  }

  const openTrash = () => {
    setCurrentFolder(TRASH_FOLDER_ID)
    setFolderName('Корзина')
    setFolderPath([{ id: TRASH_FOLDER_ID, name: 'Корзина' }])
    closeMenu()
  }

  const handleBack = () => {
    if (folderPath.length <= 1) {
      setCurrentFolder(null)
      setFolderName('')
      setFolderPath([])
      return
    }
    const nextPath = folderPath.slice(0, -1)
    const parent = nextPath[nextPath.length - 1]
    setCurrentFolder(parent.id)
    setFolderName(parent.name)
    setFolderPath(nextPath)
  }

  const openRoot = () => {
    setCurrentFolder(null)
    setFolderName('')
    setFolderPath([])
    closeMenu()
  }

  const openPathItem = (pathItem, index) => {
    setCurrentFolder(pathItem.id)
    setFolderName(pathItem.name)
    setFolderPath(folderPath.slice(0, index + 1))
    closeMenu()
  }

  const refresh = () => loadFiles(currentFolder)

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || uploading || isTrash) return

    closeMenu()
    const progressById = new Map()
    const transferIds = files.map(file => {
      const id = createTransfer({
        type: 'upload',
        name: file.name,
        size: file.size,
        status: 'queued',
        progress: 0
      })
      const state = { canceled: false, controller: null }
      uploadCancelState.current.set(id, state)
      registerTransferCancel(id, () => {
        state.canceled = true
        state.controller?.abort()
        updateTransfer(id, { status: 'canceled', progress: 0 })
      })
      progressById.set(id, 0)
      return id
    })
    const updateBatchProgress = () => {
      const totalProgress = transferIds.reduce((sum, id) => sum + (progressById.get(id) || 0), 0)
      setUploadProgress(Math.round(totalProgress / transferIds.length))
    }

    let nextIndex = 0
    let activeCount = 0
    let successCount = 0
    let failedCount = 0

    const runUpload = async (index) => {
      const file = files[index]
      const transferId = transferIds[index]
      const state = uploadCancelState.current.get(transferId)
      if (!state || state.canceled) {
        progressById.set(transferId, 100)
        updateBatchProgress()
        return
      }

      const controller = new AbortController()
      state.controller = controller
      activeCount += 1
      updateTransfer(transferId, { status: 'active', progress: 0 })
      setUploading({ current: activeCount, total: files.length, name: file.name, progress: 0 })

      try {
        await uploadFile(file, currentFolder, fileProgress => {
          const progress = Math.round(fileProgress * 100)
          progressById.set(transferId, progress)
          updateTransfer(transferId, { status: 'active', progress })
          updateBatchProgress()
          setUploading({ current: activeCount, total: files.length, name: file.name, progress })
        }, controller.signal)
        successCount += 1
        progressById.set(transferId, 100)
        updateTransfer(transferId, { status: 'done', progress: 100 })
      } catch (error) {
        progressById.set(transferId, 100)
        if (error.name === 'AbortError' || state.canceled) {
          updateTransfer(transferId, { status: 'canceled', progress: 0 })
        } else {
          failedCount += 1
          updateTransfer(transferId, { status: 'error', error: error.message, progress: 100 })
        }
      } finally {
        activeCount = Math.max(0, activeCount - 1)
        state.controller = null
        uploadCancelState.current.delete(transferId)
        unregisterTransferCancel(transferId)
        updateBatchProgress()
      }
    }

    const worker = async () => {
      while (nextIndex < files.length) {
        const index = nextIndex
        nextIndex += 1
        await runUpload(index)
      }
    }

    setUploading({ current: 0, total: files.length, name: files[0].name, progress: 0 })
    try {
      const concurrency = Math.min(2, files.length)
      await Promise.all(Array.from({ length: concurrency }, worker))
      if (successCount > 0) await Promise.all([refresh(), loadStats(), loadAuditLog()])
      if (failedCount > 0) window.alert(`Не удалось загрузить файлов: ${failedCount}`)
    } finally {
      setUploading(null)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openFilePicker = () => {
    if (isTrash) return
    closeMenu()
    fileInputRef.current?.click()
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    if (event.dataTransfer?.types.includes('application/x-ftpgram-item')) return
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

  const moveDraggedItems = async (draggedItem, targetFolderId) => {
    const draggedSelection = isSelected(draggedItem)
      ? selectedActionItems
      : [draggedItem].filter(item => !isSystemFolder(item))
    const movableItems = draggedSelection.filter(item => item.id !== targetFolderId)
    if (!movableItems.length || isTrash) return

    try {
      await Promise.all(movableItems.map(item => moveItem(item.type, item.id, targetFolderId)))
      clearSelection()
      await Promise.all([refresh(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const getDraggedItem = (event) => {
    const id = event.dataTransfer.getData('application/x-ftpgram-item') || event.dataTransfer.getData('text/plain')
    return items.find(item => item.id === id)
  }

  const handleItemDragStart = (event, item) => {
    if (isTrash || item.id === TRASH_FOLDER_ID || isSystemFolder(item)) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-ftpgram-item', item.id)
    event.dataTransfer.setData('text/plain', item.id)
  }

  const handleInternalDrop = async (event, targetFolderId) => {
    const draggedItem = getDraggedItem(event)
    if (!draggedItem) return false
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setIsDragging(false)
    await moveDraggedItems(draggedItem, targetFolderId)
    return true
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    if (await handleInternalDrop(event, currentFolder)) return
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

  const selectedItems = useMemo(
    () => selectedIds.map(id => items.find(item => item.id === id)).filter(Boolean),
    [items, selectedIds]
  )

  const selectedActionItems = selectedItems.filter(item => !isSystemFolder(item))
  const selectedFileItems = selectedItems.filter(item => item.type === 'file')
  const hasSelection = selectedItems.length > 0

  const isSelected = item => selectedIds.includes(item.id)

  const toggleSelection = (item) => {
    closeMenu()
    if (item.id === TRASH_FOLDER_ID) return
    setSelectedIds(ids => ids.includes(item.id)
      ? ids.filter(id => id !== item.id)
      : [...ids, item.id]
    )
  }

  const clearSelection = () => setSelectedIds([])

  const selectAllVisible = () => {
    setSelectedIds(selectableItems.map(item => item.id))
    closeMenu()
  }

  const createFolderAction = async () => {
    closeMenu()
    if (isTrash) return
    const name = window.prompt('Название папки')
    if (!name?.trim()) return
    try {
      await createFolder(name, currentFolder)
      await Promise.all([refresh(), loadAuditLog()])
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
      if (item.type === 'folder') {
        if (currentFolder === item.id) setFolderName(name)
        setFolderPath(path => path.map(pathItem => pathItem.id === item.id ? { ...pathItem, name } : pathItem))
      }
      await Promise.all([refresh(), loadAuditLog()])
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
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const deleteSelectedAction = async () => {
    closeMenu()
    if (!selectedActionItems.length) return
    if (!window.confirm(`Удалить выбранные элементы (${selectedActionItems.length})?`)) return
    try {
      await Promise.all(selectedActionItems.map(item => deleteItem(item.type, item.id)))
      clearSelection()
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const restoreAction = async (item) => {
    closeMenu()
    try {
      await restoreItem(item.type, item.id)
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const restoreSelectedAction = async () => {
    closeMenu()
    if (!selectedItems.length) return
    try {
      await Promise.all(selectedItems.map(item => restoreItem(item.type, item.id)))
      clearSelection()
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const deleteForeverAction = async (item) => {
    closeMenu()
    if (!window.confirm(`Удалить навсегда "${item.name}"? Это действие нельзя отменить.`)) return
    try {
      await deleteForever(item.type, item.id)
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const deleteSelectedForeverAction = async () => {
    closeMenu()
    if (!selectedItems.length) return
    if (!window.confirm(`Удалить навсегда выбранные элементы (${selectedItems.length})? Это действие нельзя отменить.`)) return
    try {
      await Promise.all(selectedItems.map(item => deleteForever(item.type, item.id)))
      clearSelection()
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const emptyTrashAction = async () => {
    closeMenu()
    if (!window.confirm('Очистить корзину навсегда? Это действие нельзя отменить.')) return
    try {
      await emptyTrash()
      await Promise.all([refresh(), loadStats(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const markDownloadStarted = (name = 'Скачивание', duration = 1200) => {
    const transferId = createTransfer({
      type: 'download',
      name,
      status: 'active',
      progress: 35
    })
    setDownloadProgress(35)
    window.setTimeout(() => {
      setDownloadProgress(100)
      updateTransfer(transferId, { status: 'active', progress: 100 })
    }, Math.min(600, duration))
    window.setTimeout(() => {
      setDownloadProgress(0)
      updateTransfer(transferId, { status: 'done', progress: 100 })
    }, duration)
  }

  const downloadAction = (item) => {
    closeMenu()
    markDownloadStarted(item.name)
    downloadItem(item.id)
  }

  const downloadSelectedAction = () => {
    closeMenu()
    markDownloadStarted(`${selectedFileItems.length} файлов`, Math.max(1400, selectedFileItems.length * 450))
    selectedFileItems.forEach((item, index) => {
      window.setTimeout(() => downloadItem(item.id), index * 300)
    })
  }

  const previewAction = (item) => {
    closeMenu()
    setPreviewFile(item)
  }

  const googleDocsAction = async (item) => {
    closeMenu()
    try {
      await openInGoogleDocs(item.id)
    } catch (error) {
      window.alert(error.message)
    }
  }

  const openTelegramAction = () => {
    closeMenu()
    window.open(STORAGE_TELEGRAM_URL, '_blank', 'noopener,noreferrer')
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
      await Promise.all([refresh(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const moveSelectedAction = async () => {
    closeMenu()
    if (!selectedActionItems.length) return
    try {
      const selectedIdSet = new Set(selectedActionItems.map(item => item.id))
      const folderOptions = (await fetchFolders()).filter(folder => !selectedIdSet.has(folder.id))
      const options = ['0. Мой диск', ...folderOptions.map((folder, index) => `${index + 1}. ${folder.name}`)]
      const choice = window.prompt(`Выбери папку назначения:\n${options.join('\n')}`, '0')
      if (choice === null) return

      const index = Number(choice)
      if (!Number.isInteger(index) || index < 0 || index > folderOptions.length) {
        window.alert('Укажи номер папки из списка')
        return
      }

      const target = index === 0 ? null : folderOptions[index - 1]
      await Promise.all(selectedActionItems.map(item => moveItem(item.type, item.id, target?.id || null)))
      clearSelection()
      await Promise.all([refresh(), loadAuditLog()])
    } catch (error) {
      window.alert(error.message)
    }
  }

  const startLongPress = (event, item = null) => {
    const touch = event.touches[0]
    const point = { clientX: touch.clientX, clientY: touch.clientY }
    longPressTriggered.current = false
    const timer = window.setTimeout(() => {
      longPressTriggered.current = true
      openMenu(point, item)
    }, 550)
    setTouchTimer(timer)
  }

  const cancelLongPress = () => {
    if (touchTimer) window.clearTimeout(touchTimer)
    setTouchTimer(null)
  }

  const consumeLongPress = () => {
    if (!longPressTriggered.current) return false
    longPressTriggered.current = false
    return true
  }

  const handleFolderItemClick = (event, folder) => {
    event.stopPropagation()
    if (consumeLongPress()) return
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(folder)
      return
    }
    handleFolderClick(folder)
  }

  const handleFileItemClick = (event, file) => {
    event.stopPropagation()
    if (consumeLongPress()) return
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(file)
      return
    }
    previewAction(file)
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
    if (item.id === TRASH_FOLDER_ID) return 'Корзина'
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
  const selectableItems = visibleItems.filter(item => item.id !== TRASH_FOLDER_ID)
  const ViewIcon = viewMode === 'table' ? List : viewMode === 'gallery' ? Images : LayoutGrid

  const renderSelectionButton = (item) => {
    if (item.id === TRASH_FOLDER_ID) return <span className="size-5 shrink-0" />
    const selected = isSelected(item)
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          toggleSelection(item)
        }}
        className={`flex size-5 shrink-0 items-center justify-center rounded border ${
          selected
            ? 'border-accent-primary/70 bg-accent-primary text-white'
            : 'border-gray-600 bg-gray-900/60 text-transparent hover:border-gray-400'
        }`}
        aria-label={selected ? 'Снять выбор' : 'Выбрать'}
        aria-pressed={selected}
      >
        <Check size={14} strokeWidth={3} />
      </button>
    )
  }

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-bg-main"
      onClick={(event) => {
        if (consumeLongPress()) {
          event.stopPropagation()
          return
        }
        closeMenu()
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-main">
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {currentFolder && (
              <button onClick={handleBack} className="rounded-md p-1 hover:bg-bg-hover" title="Назад">
                <ArrowLeft size={20} className="text-gray-400" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="min-w-0 truncate text-lg font-semibold text-white">
                {currentFolder ? folderName : 'Мой диск'}
              </h1>
              <nav className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-xs text-gray-500" aria-label="Путь">
                <button
                  type="button"
                  onClick={openRoot}
                  className={`truncate hover:text-gray-200 ${!currentFolder ? 'text-accent-primary' : ''}`}
                >
                  Мой диск
                </button>
                {folderPath.map((pathItem, index) => (
                  <React.Fragment key={pathItem.id}>
                    <span className="shrink-0 text-gray-700">/</span>
                    <button
                      type="button"
                      onClick={() => openPathItem(pathItem, index)}
                      className={`truncate hover:text-gray-200 ${index === folderPath.length - 1 ? 'text-accent-primary' : ''}`}
                    >
                      {pathItem.name}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={openFilePicker}
              disabled={Boolean(uploading) || isTrash}
              className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-accent-primary px-3 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Загрузить</span>
            </button>
            <button
              type="button"
              onClick={openTrash}
              className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${
                isTrash
                  ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                  : 'border-gray-700 bg-bg-card text-gray-400 hover:bg-bg-hover hover:text-white'
              }`}
              aria-label="Открыть корзину"
              title="Корзина"
            >
              <Trash2 size={17} />
            </button>
          </div>
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
              className="h-9 w-full rounded-md border border-gray-700 bg-bg-card pl-9 pr-9 text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-accent-primary"
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
              className="h-9 w-full appearance-none rounded-md border border-gray-700 bg-bg-card pl-9 pr-8 text-sm text-gray-200 outline-none hover:bg-bg-hover focus:border-accent-primary sm:w-auto"
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
              className="h-9 w-full appearance-none truncate rounded-md border border-gray-700 bg-bg-card pl-9 pr-8 text-sm text-gray-200 outline-none hover:bg-bg-hover focus:border-accent-primary sm:max-w-[190px]"
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
          className={`relative flex-1 overflow-y-auto p-4 scrollbar-thin ${isDragging ? 'bg-accent-primary/5' : ''}`}
          onClick={closeMenu}
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
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-accent-primary/70 bg-bg-main/90">
              <div className="text-center text-accent-primary">
                <Upload size={44} className="mx-auto mb-3" />
                <p className="font-medium">Отпусти файлы для загрузки</p>
                <p className="mt-1 text-xs text-gray-400">
                  {currentFolder ? `В папку «${folderName}»` : 'В FTPgram Storage'}
                </p>
              </div>
            </div>
          )}

          {uploading && (
            <div className="sticky top-0 z-10 mb-4 rounded-md border border-accent-primary/40 bg-bg-card p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-200">{uploading.name}</span>
                <span className="shrink-0 text-accent-primary">
                  {uploading.current}/{uploading.total} · {uploading.progress}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                <div className="h-full bg-accent-primary" style={{ width: `${uploading.progress}%` }} />
              </div>
            </div>
          )}

          {hasSelection && (
            <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent-primary/40 bg-bg-card p-3 shadow-lg">
              <div className="flex min-w-0 items-center gap-2 text-sm text-gray-200">
                <CheckSquare size={17} className="shrink-0 text-accent-primary" />
                <span className="truncate">Выбрано: {selectedItems.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isTrash && selectedFileItems.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadSelectedAction}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-bg-hover"
                  >
                    Скачать
                  </button>
                )}
                {!isTrash && selectedActionItems.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={moveSelectedAction}
                      className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-bg-hover"
                    >
                      Переместить
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedAction}
                      className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
                    >
                      Удалить
                    </button>
                  </>
                )}
                {isTrash && (
                  <>
                    <button
                      type="button"
                      onClick={restoreSelectedAction}
                      className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-bg-hover"
                    >
                      Восстановить
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedForeverAction}
                      className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
                    >
                      Удалить навсегда
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:bg-bg-hover hover:text-gray-200"
                >
                  Снять
                </button>
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
                    draggable={!isTrash && !isSystemFolder(item) && item.id !== TRASH_FOLDER_ID}
                    className={`grid min-h-12 cursor-pointer grid-cols-[minmax(180px,1fr)_110px_90px_120px] items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0 hover:bg-bg-hover max-md:grid-cols-[minmax(160px,1fr)_90px] ${
                      isSelected(item) ? 'border-accent-primary/30 bg-accent-primary/10' : 'border-gray-800'
                    }`}
                    onDragStart={(event) => handleItemDragStart(event, item)}
                    onDragOver={(event) => {
                      if (item.type === 'folder' && !isTrash) event.preventDefault()
                    }}
                    onDrop={(event) => {
                      if (item.type === 'folder') handleInternalDrop(event, item.id)
                    }}
                    onClick={(event) => {
                      if (item.type === 'folder') handleFolderItemClick(event, item)
                      else handleFileItemClick(event, item)
                    }}
                    onContextMenu={(event) => openMenu(event, item)}
                    onTouchStart={(event) => startLongPress(event, item)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {renderSelectionButton(item)}
                      {item.type === 'folder'
                        ? item.id === TRASH_FOLDER_ID
                          ? <Trash2 className="shrink-0 text-gray-400" size={20} />
                          : <Folder className="shrink-0 text-yellow-400" size={20} />
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
                    draggable={!isTrash && !isSystemFolder(folder)}
                    className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border bg-bg-card hover:border-gray-700 hover:bg-bg-hover ${
                      isSelected(folder) ? 'border-accent-primary/60 ring-1 ring-accent-primary/40' : 'border-gray-800'
                    }`}
                    onDragStart={(event) => handleItemDragStart(event, folder)}
                    onDragOver={(event) => {
                      if (!isTrash) event.preventDefault()
                    }}
                    onDrop={(event) => handleInternalDrop(event, folder.id)}
                    onClick={(event) => handleFolderItemClick(event, folder)}
                    onContextMenu={(event) => openMenu(event, folder)}
                    onTouchStart={(event) => startLongPress(event, folder)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="absolute left-2 top-2 z-10">{renderSelectionButton(folder)}</div>
                    <div className="flex aspect-video items-center justify-center bg-gray-900">
                      {folder.id === TRASH_FOLDER_ID
                        ? <Trash2 className="text-gray-400" size={52} />
                        : <Folder className="text-yellow-400" size={52} />}
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
                    draggable={!isTrash}
                    className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border bg-bg-card hover:border-gray-700 hover:bg-bg-hover ${
                      isSelected(file) ? 'border-accent-primary/60 ring-1 ring-accent-primary/40' : 'border-gray-800'
                    }`}
                    onDragStart={(event) => handleItemDragStart(event, file)}
                    onClick={(event) => handleFileItemClick(event, file)}
                    onContextMenu={(event) => openMenu(event, file)}
                    onTouchStart={(event) => startLongPress(event, file)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="absolute left-2 top-2 z-10">{renderSelectionButton(file)}</div>
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
                    draggable={!isTrash && !isSystemFolder(folder)}
                    className={`relative min-w-0 cursor-pointer rounded-lg border bg-bg-card p-4 hover:border-gray-700 hover:bg-bg-hover ${
                      isSelected(folder) ? 'border-accent-primary/60 ring-1 ring-accent-primary/40' : 'border-transparent'
                    }`}
                    onDragStart={(event) => handleItemDragStart(event, folder)}
                    onDragOver={(event) => {
                      if (!isTrash) event.preventDefault()
                    }}
                    onDrop={(event) => handleInternalDrop(event, folder.id)}
                    onClick={(event) => handleFolderItemClick(event, folder)}
                    onContextMenu={(event) => openMenu(event, folder)}
                    onTouchStart={(event) => startLongPress(event, folder)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="absolute left-2 top-2">{renderSelectionButton(folder)}</div>
                    <div className="mb-3 flex justify-center">
                      {folder.id === TRASH_FOLDER_ID
                        ? <Trash2 className="text-gray-400" size={40} />
                        : <Folder className="text-yellow-400" size={40} />}
                    </div>
                    <div className="truncate text-center text-sm font-medium" title={folder.name}>{folder.name}</div>
                  </div>
                ))}
                {fileItems.map(file => (
                  <div
                    key={file.id}
                    data-drive-item
                    draggable={!isTrash}
                    className={`relative min-w-0 cursor-pointer rounded-lg border bg-bg-card p-4 hover:border-gray-700 hover:bg-bg-hover ${
                      isSelected(file) ? 'border-accent-primary/60 ring-1 ring-accent-primary/40' : 'border-transparent'
                    }`}
                    onDragStart={(event) => handleItemDragStart(event, file)}
                    onClick={(event) => handleFileItemClick(event, file)}
                    onContextMenu={(event) => openMenu(event, file)}
                    onTouchStart={(event) => startLongPress(event, file)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                  >
                    <div className="absolute left-2 top-2">{renderSelectionButton(file)}</div>
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
                <p>{query ? 'Ничего не найдено' : isTrash ? 'Корзина пуста' : currentFolder ? 'Папка пуста' : 'Нет файлов'}</p>
                {query ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setQuery('')
                    }}
                    className="mt-2 text-sm text-accent-primary hover:text-accent-primary"
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
          {!isTrash && (
            <>
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
              {!menu.item && selectableItems.length > 0 && (
                <button
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                  onClick={selectAllVisible}
                >
                  <CheckSquare size={16} />
                  Выбрать все
                </button>
              )}
            </>
          )}

          {isTrash && !menu.item && (
            <button
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
              onClick={emptyTrashAction}
            >
              <Trash2 size={16} />
              Очистить корзину
            </button>
          )}

          {isTrash && menu.item && (
            <>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                onClick={() => restoreAction(menu.item)}
              >
                <MoveRight size={16} />
                Восстановить
              </button>
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                onClick={() => deleteForeverAction(menu.item)}
              >
                <Trash2 size={16} />
                Удалить навсегда
              </button>
            </>
          )}

          {!isTrash && menu.item?.type === 'file' && (
            <>
              {isOfficeFile(menu.item) && (
                <button
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                  onClick={() => googleDocsAction(menu.item)}
                >
                  <ExternalLink size={16} />
                  Открыть в Google Docs
                </button>
              )}
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
                onClick={() => downloadAction(menu.item)}
              >
                <Download size={16} />
                Скачать
              </button>
            </>
          )}

          {!isTrash && menu.item?.id === STORAGE_FOLDER_ID && (
            <button
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-200 hover:bg-bg-hover"
              onClick={openTelegramAction}
            >
              <ExternalLink size={16} />
              Открыть в Telegram
            </button>
          )}

          {!isTrash && menu.item && !isSystemFolder(menu.item) && (
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

      {previewFile && (
        <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  )
}
