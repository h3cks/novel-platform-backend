#!/bin/bash
# Скрипт для автоматичного розгортання та оновлення додатку
set -e

echo "Починаємо розгортання..."
git pull origin main
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 reload novel-api
echo "Розгортання успішно завершено!"