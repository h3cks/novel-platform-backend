// scripts/populate-languageRatio.ts
import prisma from '../prisma/client'; // <- підкоригуйте шлях, якщо у вас інший
import { stripHtml } from '../utils/text'; // використовуємо вашу утиліту для чистки html

function cyrillicRatio(text: string) {
  if (!text) return 0;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  let cyrCount = 0;
  for (const ch of letters) {
    if (/\p{Script=Cyrillic}/u.test(ch)) cyrCount++;
  }
  return cyrCount / letters.length;
}

async function main() {
  const batchSize = 500; // підлаштуйте під розмір БД / пам'ять
  let lastId = 0;
  let updated = 0;

  while (true) {
    const rows = await prisma.chapter.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, content: true },
    });

    if (rows.length === 0) break;

    const txUpdates = rows.map(r => {
      const plain = stripHtml(r.content ?? '');
      const ratio = cyrillicRatio(plain);
      return prisma.chapter.update({
        where: { id: r.id },
        data: { languageRatio: ratio },
      });
    });

    // Виконуємо оновлення у транзакції (можна і без транзакцій для великих наборів)
    try {
      await prisma.$transaction(txUpdates);
    } catch (e) {
      console.error('Batch update failed (trying individual updates)...', e);
      // fallback: оновити по одному, щоб не зупиняти весь процес
      for (const r of rows) {
        try {
          const plain = stripHtml(r.content ?? '');
          const ratio = cyrillicRatio(plain);
          await prisma.chapter.update({ where: { id: r.id }, data: { languageRatio: ratio } });
        } catch (ee) {
          console.warn('Failed to update chapter', r.id, ee);
        }
      }
    }

    lastId = rows[rows.length - 1].id;
    updated += rows.length;
    console.log(`Updated ${updated} chapters...`);
  }

  console.log('Done. Total updated:', updated);
}

main()
  .catch((e) => {
    console.error('Script failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
