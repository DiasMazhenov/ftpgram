import React, { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, File, X } from 'lucide-react'
import { downloadItem, getFileUrl, isOfficeFile, openInGoogleDocs } from '../api'

const getPreviewType = (file) => {
  const mimeType = file.mime_type || ''
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'document'
  if (mimeType === 'application/json' || extension === 'json') return 'json'
  if (mimeType.startsWith('text/') || ['txt', 'md', 'csv', 'log'].includes(extension)) return 'document'
  return 'unsupported'
}

export const FilePreview = ({ file, onClose }) => {
  const dialogRef = useRef(null)
  const previewType = getPreviewType(file)
  const previewUrl = getFileUrl(file.id, true)
  const officeFile = isOfficeFile(file)
  const [jsonPreview, setJsonPreview] = useState({ loading: false, content: '', error: '' })

  const openGoogleDocs = async () => {
    try {
      await openInGoogleDocs(file.id)
    } catch (error) {
      window.alert(error.message)
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  useEffect(() => {
    if (previewType !== 'json') return
    let active = true
    setJsonPreview({ loading: true, content: '', error: '' })

    fetch(previewUrl)
      .then(response => {
        if (!response.ok) throw new Error(`JSON: ${response.status}`)
        return response.text()
      })
      .then(text => {
        if (!active) return
        try {
          setJsonPreview({
            loading: false,
            content: JSON.stringify(JSON.parse(text), null, 2),
            error: ''
          })
        } catch {
          setJsonPreview({ loading: false, content: text, error: 'Файл не похож на валидный JSON' })
        }
      })
      .catch(error => {
        if (active) setJsonPreview({ loading: false, content: '', error: error.message })
      })

    return () => {
      active = false
    }
  }, [previewType, previewUrl])

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto h-[min(88dvh,820px)] w-[min(94vw,1100px)] overflow-hidden rounded-lg border border-gray-700 bg-bg-main p-0 text-gray-100 shadow-2xl backdrop:bg-black/75"
      aria-labelledby="file-preview-title"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-800 px-4">
          <div className="min-w-0">
            <h2 id="file-preview-title" className="truncate text-sm font-semibold text-white" title={file.name}>
              {file.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{file.mime_type || 'Неизвестный тип'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {officeFile && (
              <button
                type="button"
                onClick={openGoogleDocs}
                className="flex size-9 items-center justify-center rounded-md text-gray-400 hover:bg-bg-hover hover:text-white"
                aria-label="Открыть через Google Docs"
                title="Открыть через Google Docs"
              >
                <ExternalLink size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadItem(file.id)}
              className="flex size-9 items-center justify-center rounded-md text-gray-400 hover:bg-bg-hover hover:text-white"
              aria-label="Скачать файл"
              title="Скачать"
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="flex size-9 items-center justify-center rounded-md text-gray-400 hover:bg-bg-hover hover:text-white"
              aria-label="Закрыть предпросмотр"
              title="Закрыть"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/30 p-3">
          {previewType === 'image' && (
            <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
          )}

          {previewType === 'video' && (
            <video
              src={previewUrl}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full bg-black"
            />
          )}

          {previewType === 'audio' && (
            <div className="w-full max-w-xl px-4">
              <audio src={previewUrl} controls autoPlay className="w-full" />
            </div>
          )}

          {previewType === 'document' && (
            <iframe
              src={previewUrl}
              title={`Предпросмотр ${file.name}`}
              className="size-full border-0 bg-white"
            />
          )}

          {previewType === 'json' && (
            <div className="flex size-full flex-col overflow-hidden rounded-md border border-gray-800 bg-gray-950">
              <div className="flex min-h-10 items-center justify-between border-b border-gray-800 px-3 text-xs text-gray-500">
                <span>JSON</span>
                {jsonPreview.error && <span className="text-yellow-300">{jsonPreview.error}</span>}
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 text-left text-xs leading-5 text-gray-200">
                {jsonPreview.loading ? 'Загрузка JSON...' : jsonPreview.content}
              </pre>
            </div>
          )}

          {previewType === 'unsupported' && (
            <div className="max-w-sm text-center">
              <File size={56} className="mx-auto text-gray-500" />
              <p className="mt-4 text-sm font-medium text-gray-200">Предпросмотр недоступен</p>
              <p className="mt-1 text-pretty text-xs text-gray-500">
                {officeFile
                  ? 'Файл можно открыть через Google Docs или скачать.'
                  : 'Скачай файл, чтобы открыть его на компьютере.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {officeFile && (
                  <button
                    type="button"
                    onClick={openGoogleDocs}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-accent-primary px-3 text-sm font-medium text-white hover:bg-accent-primary/90"
                  >
                    <ExternalLink size={16} />
                    Google Docs
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadItem(file.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-700 px-3 text-sm font-medium text-gray-200 hover:bg-bg-hover"
                >
                  <Download size={16} />
                  Скачать
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
