import { makeCollectors, notifyMatches, refreshKnownProzorro, runPipeline } from './pipeline.js';
import type { LotSource } from './types.js';

/**
 * CLI:
 *   npm run collect                 — повний прохід усіх джерел + сповіщення
 *   npm run collect -- --source=prozorro
 *   npm run collect -- --dry-run    — тільки забрати й вивести лоти, без БД
 *   npm run match                   — лише розсилка по наявних збігах
 */
function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p?.split('=')[1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const cmd = process.argv[2] ?? 'collect';
  const only = arg('source') as LotSource | undefined;
  if (only && !['prozorro','setam'].includes(only)) throw new Error('Невідоме джерело');
  if (cmd==='refresh') {
    const limit=Number(arg('limit') ?? '200');
    if (!Number.isInteger(limit)||limit<1) throw new Error('Некоректний ліміт оновлення');
    await refreshKnownProzorro(limit);
    return;
  }

  if (cmd === 'match') {
    await notifyMatches();
    return;
  }

  if (cmd === 'collect') {
    if (flag('dry-run')) {
      // без БД: показати перші лоти для перевірки мапінгу
      for (const c of makeCollectors(only)) {
        console.log(`\n=== DRY RUN: ${c.source} ===`);
        const { lots } = await c.collect(null);
        console.log(`лотів: ${lots.length}`);
        for (const l of lots.slice(0, 5)) {
          console.log(JSON.stringify({
            source: l.source, source_id: l.source_id, asset_type: l.asset_type,
            title: l.title, region: l.region, start_price: l.start_price,
            selling_method: l.selling_method, bids_end: l.bids_end, url: l.lot_url,
          }, null, 2));
        }
      }
      return;
    }
    await runPipeline({ only, noNotify:flag('no-notify'),noGeocode:flag('no-geocode') });
    return;
  }

  console.error(`Невідома команда: ${cmd}. Доступні: collect, match.`);
  process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
