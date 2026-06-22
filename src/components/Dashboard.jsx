import React from 'react'
import { Download, Globe, RefreshCw, Server, Upload } from 'lucide-react'
import packageJson from '../../package.json'
import { useApp } from '../AppContext'

const classes = (...values) => values.filter(Boolean).join(' ')

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const TransferStatus = ({ icon: Icon, title, progress, color, idleText }) => (
  <div className="rounded-lg border border-gray-800 bg-bg-card p-4">
    <div className="flex min-w-0 items-center gap-3">
      <div className={classes('flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-900', color)}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-semibold text-gray-200">{title}</h2>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{progress}%</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">FTP/WebDAV</p>
      </div>
    </div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-700">
      <div
        className={classes('h-full', progress > 0 ? 'bg-blue-500' : 'bg-gray-600')}
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="mt-2 truncate text-xs text-gray-500">{progress > 0 ? 'Передача данных' : idleText}</p>
  </div>
)

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

  const statusColor = connectionStatus === 'connected'
    ? 'text-green-400'
    : connectionStatus === 'connecting'
      ? 'text-yellow-400'
      : 'text-gray-500'

  const toggleClass = enabled => classes(
    'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent',
    enabled ? 'bg-green-500' : 'bg-gray-600'
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden">
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={classes(
                'size-3 shrink-0 rounded-full',
                connectionStatus === 'connected'
                  ? 'bg-green-500'
                  : connectionStatus === 'connecting'
                    ? 'animate-pulse bg-yellow-500'
                    : 'bg-gray-500'
              )}
            />
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-lg font-semibold text-white">FTPgram</h1>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">{packageJson.version}</span>
            </div>
          </div>
          <button
            onClick={checkStatus}
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
            aria-label="Проверить подключение"
            title="Проверить подключение"
          >
            <RefreshCw size={17} className={connectionStatus === 'connecting' ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin">
        <section className="rounded-lg border border-gray-800 bg-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Globe className="shrink-0 text-blue-400" size={20} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-200">Telegram</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">Подключение к API</p>
              </div>
            </div>
            <span className={classes('shrink-0 text-xs font-medium', statusColor)}>
              {connectionStatusText}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              [stats.files, 'Файлов'],
              [stats.folders, 'Папок'],
              [formatBytes(stats.totalSize), 'Занято']
            ].map(([value, label], index) => (
              <div
                key={label}
                className={classes(
                  'min-w-0 rounded-md bg-gray-900/70 px-2 py-3 text-center',
                  index === 2 && 'col-span-2'
                )}
              >
                <div className="truncate whitespace-nowrap text-lg font-semibold tabular-nums text-white" title={String(value)}>
                  {value}
                </div>
                <div className="mt-1 truncate text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-bg-card p-4">
          <div className="flex items-center gap-3">
            <Server className="shrink-0 text-blue-400" size={20} />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-gray-200">Локальный сервер</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">FTP и WebDAV</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {[
              { name: 'FTP', port: 21, enabled: ftpEnabled, toggle: toggleFtp },
              { name: 'WebDAV', port: 80, enabled: webdavEnabled, toggle: toggleWebdav }
            ].map(protocol => (
              <div
                key={protocol.name}
                className={classes(
                  'min-w-0 rounded-md border p-3',
                  protocol.enabled ? 'border-green-500/70 bg-green-500/10' : 'border-gray-700 bg-gray-900/50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-white">{protocol.name}</span>
                  <button
                    type="button"
                    onClick={protocol.toggle}
                    className={toggleClass(protocol.enabled)}
                    aria-label={`${protocol.enabled ? 'Отключить' : 'Включить'} ${protocol.name}`}
                    aria-pressed={protocol.enabled}
                  >
                    <span
                      className={classes(
                        'pointer-events-none inline-block size-5 rounded-full bg-white shadow',
                        protocol.enabled ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
                <p className="mt-2 truncate text-xs text-gray-400">
                  {protocol.enabled ? `Порт ${protocol.port}` : 'Отключен'}
                </p>
              </div>
            ))}
          </div>
        </section>

        <TransferStatus
          icon={Upload}
          title="Загрузка"
          progress={uploadProgress}
          color="text-blue-400"
          idleText="Ожидание загрузки"
        />
        <TransferStatus
          icon={Download}
          title="Скачивание"
          progress={downloadProgress}
          color="text-green-400"
          idleText="Ожидание скачивания"
        />
      </div>
    </div>
  )
}
