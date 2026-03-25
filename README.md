# YieldMonitor Dashboard

A comprehensive crypto yield aggregator dashboard for monitoring and analyzing yields across various protocols including Pendle, Spectra, Exponent, and RateX.

## Features

- **Protocol Monitoring**: Track implied and underlying APYs across multiple platforms.
- **Alerts System**: Get notified about significant yield changes and new market additions.
- **Unified Interface**: A single dashboard for major DeFi yield protocols.
- **Advanced Filtering**: Filter by protocol, asset, and yield type.

## Getting Started

Follow these steps to set up the project locally:

### Prerequisites

- Node.js & npm installed

### Installation

1. Clone the repository:
   ```sh
   git clone <YOUR_GIT_URL>
   ```

2. Navigate to the project directory:
   ```sh
   cd <YOUR_PROJECT_NAME>
   ```

3. Install the dependencies:
   ```sh
   npm i
   ```

4. Start the development server:
   ```sh
   npm run dev
   ```

## Technologies Used

- **Vite**: Build tool and development server.
- **TypeScript**: Typed JavaScript for better developer experience.
- **React**: UI library for building components.
- **Shadcn UI**: Accessible and customizable UI components.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Supabase**: Backend-as-a-service for database and edge functions.

## Live Dashboard

The production version of the service is running at: **[https://yeldmonitor.vercel.app/](https://yeldmonitor.vercel.app/)**

## Deployment Guide

The project consists of two separate environments (Frontend and Backend). Как деплоить (загружать) изменения зависит от того, **что именно** вы поменяли:

### 1. Изменения интерфейса (Frontend / React / Сайт)
Если вы меняли кнопки, дизайн, окна настроек или что-либо внутри папки `src/`:
- **ДА, вам необходимо сделать `git push` на GitHub.**
- Сервис Vercel автоматически "слушает" ваш репозиторий на GitHub. Как только вы пушите изменения в ветку `main`, Vercel сам собирает проект и выкатывает его на `yeldmonitor.vercel.app` (занимает 1-2 минуты).

### 2. Изменения Telegram-бота и парсеров (Backend / Supabase)
Если вы меняли логику рассылок, скрипты парсинга или что-либо внутри папки `supabase/functions/`:
- **НЕТ, пуш на GitHub НЕ обновит логику бота.** (Коммит на GitHub нужен только для сохранения копии кода).
- Чтобы изменения вступили в силу, вам нужно отправить их напрямую на серверы Supabase с помощью консольной команды:
  ```sh
  npx supabase functions deploy <имя-скрипта>
  ```
  *(Например: `npx supabase functions deploy send-scheduled-notifications`)*
## Contributing

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.
