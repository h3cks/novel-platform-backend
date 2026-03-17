# Інструкція з розгортання у Production середовищі

## 1. Вимоги до апаратного забезпечення
* **Архітектура:** x86_64
* **CPU:** Мінімум 1 vCore (рекомендовано 2)
* **RAM:** Мінімум 1 GB (рекомендовано 2 GB для роботи Prisma Engine)
* **Диск:** 20 GB SSD

## 2. Необхідне програмне забезпечення
* Ubuntu 22.04 LTS
* Node.js (v18+)
* PostgreSQL 14+
* Nginx
* PM2 (встановлюється глобально: `npm install -g pm2`)

## 3. Налаштування мережі
Необхідно відкрити наступні порти на Firewall:
* `80` (HTTP) та `443` (HTTPS) для Nginx
* `22` (SSH) для доступу
  Порт СУБД (5432) повинен бути закритий для зовнішнього доступу.

## 4. Налаштування СУБД
Створіть базу даних та користувача:\
\`\`\`sql
CREATE DATABASE novel_platform;\
CREATE USER novel_admin WITH ENCRYPTED PASSWORD 'your_secure_password';\
GRANT ALL PRIVILEGES ON DATABASE novel_platform TO novel_admin;
\`\`\`

## 5. Розгортання коду
1. Клонуйте репозиторій:
   \`\`\`bash
   git clone https://github.com/h3cks/novel-platform-backend.git /var/www/novel-backend
   cd /var/www/novel-backend
   \`\`\`
2. Встановіть production-залежності:
   \`\`\`bash
   npm ci
   \`\`\`
3. Налаштуйте `.env` файл з production-документами.
4. Запустіть міграції та зберіть проєкт:
   \`\`\`bash
   npx prisma migrate deploy
   npx prisma generate
   npm run build
   \`\`\`
5. Запустіть додаток через PM2:
   \`\`\`bash
   pm2 start dist/index.js --name "novel-api"
   pm2 save
   pm2 startup
   \`\`\`

## 6. Перевірка працездатності
Виконайте `pm2 status`. Процес `novel-api` повинен мати статус `online`. Також можна перевірити логи помилок командою `pm2 logs novel-api --err`.