import React, { useState } from 'react'
import { Activity, ChevronDown, Download, Globe, LogOut, RefreshCw, Server, Upload, X } from 'lucide-react'
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
        className={classes('h-full', progress > 0 ? 'bg-accent-primary' : 'bg-gray-600')}
        style={{ width: `${progress}%` }}
      />
    </div>
    <p className="mt-2 truncate text-xs text-gray-500">{progress > 0 ? 'Передача данных' : idleText}</p>
  </div>
)

const transferStatusText = {
  queued: 'В очереди',
  active: 'Передача',
  canceling: 'Отмена',
  done: 'Готово',
  error: 'Ошибка',
  canceled: 'Отменено'
}

const auditActionText = {
  upload_file: 'Загружен файл',
  create_folder: 'Создана папка',
  rename_folder: 'Переименована папка',
  trash_folder: 'Папка в корзине',
  rename_file: 'Переименован файл',
  delete_file: 'Удален файл',
  restore_item: 'Восстановлено',
  delete_forever: 'Удалено навсегда',
  empty_trash: 'Корзина очищена',
  move_item: 'Перемещено',
  toggle_protocol: 'Протокол изменен',
  reindex: 'Индекс обновлен',
  telegram_sync_file: 'Telegram sync',
  telegram_sync_delete: 'Удалено в Telegram'
}

const formatAuditTime = value => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const AuditLog = ({ items }) => {
  if (!items.length) return null

  return (
    <section className="rounded-lg border border-gray-800 bg-bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <Activity className="shrink-0 text-accent-primary" size={20} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-200">Журнал</h2>
          <p className="mt-0.5 truncate text-xs text-gray-500">Последние действия</p>
        </div>
      </div>

      <div className="space-y-2">
        {items.slice(0, 5).map(item => (
          <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-gray-900/50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-200">
                {auditActionText[item.action] || item.action}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500" title={item.item_name || ''}>
                {item.item_name || 'Система'}
              </p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-gray-500">{formatAuditTime(item.created_at)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const TransferQueue = ({ transfers, cancelTransfer, clearFinishedTransfers }) => {
  if (!transfers.length) return null

  return (
    <section className="rounded-lg border border-gray-800 bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-200">Очередь передач</h2>
          <p className="mt-0.5 truncate text-xs text-gray-500">{transfers.length} операций</p>
        </div>
        <button
          type="button"
          onClick={clearFinishedTransfers}
          className="shrink-0 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-bg-hover hover:text-white"
        >
          Очистить
        </button>
      </div>

      <div className="space-y-2">
        {transfers.slice(0, 6).map(transfer => {
          const Icon = transfer.type === 'download' ? Download : Upload
          const canCancel = ['queued', 'active', 'canceling'].includes(transfer.status)
          return (
            <div key={transfer.id} className="rounded-md bg-gray-900/60 p-3">
              <div className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-accent-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-200" title={transfer.name}>
                      {transfer.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500">
                      {transfer.progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className={`h-full ${
                        transfer.status === 'error'
                          ? 'bg-red-500'
                          : transfer.status === 'done'
                            ? 'bg-green-500'
                            : 'bg-accent-primary'
                      }`}
                      style={{ width: `${transfer.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {transfer.error || transferStatusText[transfer.status] || transfer.status}
                  </p>
                </div>
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => cancelTransfer(transfer.id)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-bg-hover hover:text-white"
                    aria-label="Отменить передачу"
                    title="Отменить"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const Dashboard = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const {
    connectionStatus,
    connectionStatusText,
    ftpEnabled,
    webdavEnabled,
    protocols,
    uploadProgress,
    downloadProgress,
    transfers,
    stats,
    auditLog,
    syncStatus,
    authRequired,
    cancelTransfer,
    clearFinishedTransfers,
    checkStatus,
    logout,
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
            <img src="/ftpgram.svg" alt="" className="size-8 shrink-0" />
            <span
              className={classes(
                'size-2.5 shrink-0 rounded-full',
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
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {authRequired && (
              <button
                onClick={logout}
                className="flex size-9 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut size={17} />
              </button>
            )}
            <button
              onClick={checkStatus}
              className="flex size-9 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
              aria-label="Проверить подключение"
              title="Проверить подключение"
            >
              <RefreshCw size={17} className={connectionStatus === 'connecting' ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            {authRequired && (
              <button
                onClick={logout}
                className="flex size-9 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut size={17} />
              </button>
            )}
            <button
              onClick={checkStatus}
              className="flex size-9 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
              aria-label="Проверить подключение"
              title="Проверить подключение"
            >
              <RefreshCw size={17} className={connectionStatus === 'connecting' ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(open => !open)}
              className="flex size-9 items-center justify-center rounded-md bg-bg-card text-gray-300 hover:bg-bg-hover hover:text-white"
              aria-label={mobileOpen ? 'Свернуть дашборд' : 'Развернуть дашборд'}
              aria-expanded={mobileOpen}
              title={mobileOpen ? 'Свернуть' : 'Развернуть'}
            >
              <ChevronDown size={18} className={mobileOpen ? 'rotate-180' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className={`${mobileOpen ? 'block' : 'hidden'} min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin lg:block`}>
        <section className="rounded-lg border border-gray-800 bg-bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Globe className="shrink-0 text-accent-primary" size={20} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-200">Telegram</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {syncStatus.enabled ? `Live sync v${syncStatus.version}` : 'Подключение к API'}
                </p>
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
            <Server className="shrink-0 text-accent-primary" size={20} />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-gray-200">Локальный сервер</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">FTP и WebDAV</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {[
              { name: 'FTP', detail: protocols.ftp?.url || 'ftp://localhost:2121', enabled: ftpEnabled, toggle: toggleFtp },
              { name: 'WebDAV', detail: protocols.webdav?.url || 'http://localhost:4000/webdav', enabled: webdavEnabled, toggle: toggleWebdav }
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
                  {protocol.enabled ? protocol.detail : 'Отключен'}
                </p>
              </div>
            ))}
          </div>
        </section>

        <TransferQueue
          transfers={transfers}
          cancelTransfer={cancelTransfer}
          clearFinishedTransfers={clearFinishedTransfers}
        />

        <AuditLog items={auditLog} />

        {uploadProgress > 0 && (
          <TransferStatus
            icon={Upload}
            title="Загрузка"
            progress={uploadProgress}
            color="text-accent-primary"
            idleText="Ожидание загрузки"
          />
        )}
        {downloadProgress > 0 && (
          <TransferStatus
            icon={Download}
            title="Скачивание"
            progress={downloadProgress}
            color="text-green-400"
            idleText="Ожидание скачивания"
          />
        )}
      </div>
    </div>
  )
}
