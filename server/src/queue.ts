import { PgBoss } from 'pg-boss';
import { config } from 'dotenv';

config();

const boss = new PgBoss(process.env.DIRECT_URL!);

boss.on('error', (error) => {
  console.error('[PgBoss] Error:', error);
});

export async function initQueue() {
  await boss.start();
  console.log('[PgBoss] Queue started');
  return boss;
}

export { boss };
