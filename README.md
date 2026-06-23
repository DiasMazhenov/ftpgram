# FTPgram

Десктопное приложение с красивым GUI, превращающее Telegram в FTP/WebDAV хранилище.

## Архитектура

### Backend (Core)
Локальный сервис на Node.js или Go, который:
- Подключается к Telegram через MTProto
- Запускает локальный WebDAV/FTP сервер
- Управляет локальной SQLite базой для быстрого индексирования файловой структуры

### Frontend (GUI)
Чистый современный десктоп UI на React и Tailwind CSS, похожий на Transmit или CleanShotX.

## Возможности

- **Dashboard**: Отображение статуса подключения к Telegram, прогресс-бары загрузки/скачивания, переключатели протоколов FTP и WebDAV
- **File Explorer**: Двухколоночный интерфейс с виртуальной древовидной структурой папок и сеткой файлов
- **Drag-and-drop**: Загрузка файлов простым перетаскиванием
- **Контекстные действия**: Получение публичной ссылки, пересылка в Telegram, удаление, скачивание

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Запустите приложение:
```bash
npm run dev
```

3. Соберите проект:
```bash
npm run build
```

## Telegram storage

FTPgram индексирует один Telegram storage, а не список каналов и подписок.

По умолчанию используется приватный канал:

```bash
TELEGRAM_STORAGE_CHAT="https://t.me/+PRIVATE_INVITE_HASH"
```

Добавь туда аккаунт, под которым работает MTProto-сессия. Можно указать приватную
invite-ссылку, username или id канала в `TELEGRAM_STORAGE_CHAT`. Файлы из
Telegram «Избранное» индексируются в отдельную системную папку.
`TELEGRAM_INDEX_LIMIT` задает максимальное количество сообщений для индексации.
По умолчанию используется `5000`.
Удаление работает через корзину: файлы можно восстановить, удалить навсегда или
дождаться автоочистки через 30 дней.

Не добавляй реальную invite-ссылку в Git: задай её как secret environment
variable в Render.

Для открытия Word, Excel и PowerPoint через Google Docs используется
короткоживущая подписанная ссылка. В production задай случайный secret:

```bash
GOOGLE_VIEWER_SECRET="long-random-secret"
```

## WebDAV и FTP

WebDAV доступен на основном backend:

```bash
http://localhost:4000/webdav
```

FTP запускается отдельным локальным сервером:

```bash
ftp://localhost:2121
```

Порт `2121` используется по умолчанию, потому что `21` часто требует root-права
на macOS/Linux. Можно переопределить:

```bash
FTP_PORT=21
FTP_PASV_MIN=40000
FTP_PASV_MAX=40100
FTP_PASV_URL=127.0.0.1
```

Если задать `FTPGRAM_PROTOCOL_USER` и `FTPGRAM_PROTOCOL_PASSWORD`, WebDAV и FTP
будут требовать логин и пароль. Без этих переменных протоколы работают локально
без авторизации.

## Структура проекта

```
ftp-gram/
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx      # Панель управления и статистика
│   │   └── FileExplorer.jsx   # Обзор файлов и древовидная структура
│   ├── AppContext.jsx         # Контекст для управления состоянием
│   ├── App.jsx                # Главный компонент
│   ├── data/
│   │   └── mockData.jsx       # Mock данные для демонстрации
│   ├── main.jsx               # Точка входа
│   └── index.css              # Стили и Tailwind конфигурация
├── index.html                 # HTML шаблон
├── package.json
├── vite.config.js             # Vite конфигурация
├── tailwind.config.js         # Tailwind CSS конфигурация
└── tsconfig.json              # TypeScript конфигурация
```

## Разработка

### Добавление новых компонентов
1. Создайте файл компонента в папке `src/components/`
2. Импортируйте Lucide иконки для визуального оформления
3. Используйте Tailwind CSS для стилизации

### API интеграция
Для работы с бэкендом будет использоваться IPC (Inter-Process Communication) между frontend и backend сервисом.

## Текущая реализация

- ✅ Структура React проекта с Vite
- ✅ Tailwind CSS конфигурация с темной темой
- ✅ Dashboard с имитацией подключения к Telegram
- ✅ File Explorer с древовидной структурой папок
- ✅ Drag-and-drop загрузка файлов
- ✅ Контекстные действия на файлах
- ✅ Mock данные для демонстрации

## Будущие задачи

- [ ] Реализация IPC моста для общения с backend
- [ ] Подключение реального Telegram API через MTProto
- [ ] Локальный WebDAV/FTP сервер
- [ ] SQLite база для индексации файлов
- [ ] Реальная загрузка/скачивание файлов
- [ ] Темная/светлая тема
