// scripts/seed-genres-tags.ts
import prisma from '../prisma/client'; // підкоригуйте шлях якщо потрібно

async function main() {
  const genres = [
    { name: 'Фентезі', slug: 'fantasy', description: 'Магія, інші світи, фантастичні істоти' },
    { name: 'Романтика', slug: 'romance', description: 'Стосунки, любовні лінії' },
    { name: 'Бойовик', slug: 'action', description: 'Екшн, битви, пригоди' },
    { name: 'Наукова фантастика', slug: 'sci-fi', description: 'Технології, космос' },
    { name: 'Детектив', slug: 'mystery', description: 'Таємниці, розслідування' },
    { name: 'Гумор', slug: 'comedy', description: 'Комедія, легкі сюжети' },
    { name: 'Історична', slug: 'historical', description: 'Події в історичному контексті' },
  ];

  const tags = [
    { name: 'ГГ чоловік', slug: 'gg-male' },
    { name: 'Реінкарнація', slug: 'reincarnation' },
    { name: 'Перевтілення', slug: 'reincarnation-variant' },
    { name: 'Гарем', slug: 'harem' },
    { name: 'Магія', slug: 'magic' },
    { name: 'Пригоди', slug: 'adventure' },
    { name: 'Політика', slug: 'politics' },
    { name: 'Дружба', slug: 'friendship' },
    { name: 'Військова', slug: 'military' },
  ];

  for (const g of genres) {
    await prisma.genre.upsert({
      where: { name: g.name },
      update: { slug: g.slug, description: g.description },
      create: { name: g.name, slug: g.slug, description: g.description },
    });
  }

  for (const t of tags) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: { slug: t.slug },
      create: { name: t.name, slug: t.slug },
    });
  }

  console.log('Seed finished');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
