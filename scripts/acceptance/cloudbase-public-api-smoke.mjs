import fs from 'node:fs';
import path from 'node:path';

const origin = process.env.AIVOICE_PUBLIC_ORIGIN
  || 'https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com';
const [healthResponse, productsResponse] = await Promise.all([
  fetch(`${origin}/v1/health`, { signal: AbortSignal.timeout(30_000) }),
  fetch(`${origin}/v1/products`, { signal: AbortSignal.timeout(30_000) }),
]);
const health = await healthResponse.json();
const products = await productsResponse.json();
const product = products.products?.[0];
const evidence = {
  checkedAt: new Date().toISOString(),
  origin,
  health: healthResponse.ok && health.ok === true ? 'PASS' : 'FAIL',
  product: productsResponse.ok
    && product?.productCode === 'POINTS_50'
    && product?.amountFen === 990
    && product?.points === 50
    ? 'PASS'
    : 'FAIL',
  status: 'FAIL',
};
evidence.status = evidence.health === 'PASS' && evidence.product === 'PASS' ? 'PASS' : 'FAIL';
const outputPath = 'docs/auto-execute/results/cloudbase-public-api-smoke.json';
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== 'PASS') process.exitCode = 1;
