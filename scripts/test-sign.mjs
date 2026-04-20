import { compactDecrypt, importJWK, SignJWT } from 'jose';
import forge from 'node-forge';
import { randomBytes } from 'crypto';

const BASE = 'https://ca.myperformance.pl';
const NAME = 'admin@myperformance.pl';
const PASSWORD = 'duIePnR4kNufoUzBTF13PcdMJzGNqBORjwAVbjkNrhiBth62xUlGZpmyUERR0TAl';
const TTL = process.argv[2] || '8760h';

const res = await fetch(`${BASE}/provisioners`);
const body = await res.json();
const p = body.provisioners.find((x) => x.name === NAME && x.type === 'JWK');
if (!p) throw new Error('no JWK provisioner');

const { plaintext } = await compactDecrypt(p.encryptedKey, new TextEncoder().encode(PASSWORD), {
  keyManagementAlgorithms: ['PBES2-HS256+A128KW', 'PBES2-HS384+A192KW', 'PBES2-HS512+A256KW'],
  maxPBES2Count: 1_000_000,
});
const jwk = JSON.parse(new TextDecoder().decode(plaintext));
const key = await importJWK(jwk, 'ES256');

const cn = 'probe-' + Date.now();
const email = 'probe@myperformance.pl';
const sans = [email, cn];
const nonce = randomBytes(16).toString('hex');
const now = Math.floor(Date.now() / 1000);
const ott = await new SignJWT({ sha: p.key.kid, sans, nonce })
  .setProtectedHeader({ alg: 'ES256', kid: p.key.kid || jwk.kid, typ: 'JWT' })
  .setIssuer(p.name)
  .setSubject(cn)
  .setAudience(`${BASE}/1.0/sign`)
  .setIssuedAt(now)
  .setNotBefore(now - 60)
  .setExpirationTime(now + 300)
  .setJti(nonce)
  .sign(key);

const keys = forge.pki.rsa.generateKeyPair(2048);
const csr = forge.pki.createCertificationRequest();
csr.publicKey = keys.publicKey;
csr.setSubject([{ name: 'commonName', value: cn }]);
csr.sign(keys.privateKey);
const csrPem = forge.pki.certificationRequestToPem(csr);

const signRes = await fetch(`${BASE}/1.0/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ csr: csrPem, ott, notAfter: TTL }),
});
const signBody = await signRes.text();
console.log('HTTP', signRes.status);
console.log(signBody.slice(0, 500));
process.exit(signRes.ok ? 0 : 1);
