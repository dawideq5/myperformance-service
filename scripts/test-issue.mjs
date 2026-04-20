import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

const { issueClientCertificate } = await import('../lib/step-ca.ts');
try {
  const r = await issueClientCertificate({
    commonName: 'probe-' + Date.now(),
    email: 'probe@myperformance.pl',
    roles: ['sprzedawca'],
    ttlDays: 365,
  });
  console.log('OK notAfter =', r.meta.notAfter);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
