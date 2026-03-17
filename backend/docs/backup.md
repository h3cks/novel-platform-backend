# Стратегія резервного копіювання

## 1. Стратегія
* **Тип:** Повні резервні копії (Full Backup) бази даних.
* **Частота:** Щоденно о 02:00 за сервером.
* **Зберігання:** Локально (зберігаються останні 7 днів) та вивантаження у зовнішнє S3-сховище. Ротація автоматична.

## 2. Процедура створення
Резервне копіювання БД виконується утилітою `pg_dump`:
\`\`\`bash
pg_dump -U novel_admin -h localhost -F c -f /backups/novel_db_\$(date +%Y%m%d).dump novel_platform
\`\`\`
Окремо копіюється конфігураційний файл:
\`\`\`bash
cp /var/www/novel-backend/.env /backups/env_backup_$(date +%Y%m%d)
\`\`\`

## 3. Процедура відновлення
1. Зупиніть додаток:
   \`\`\`bash
   pm2 stop novel-api
   \`\`\`
2. Відновіть базу даних з файлу дампу:
   \`\`\`bash
   pg_restore -U novel_admin -h localhost -d novel_platform -1 /backups/novel_db_YYYYMMDD.dump
   \`\`\`
3. Перезапустіть додаток:
   \`\`\`bash
   pm2 start novel-api
   \`\`\`