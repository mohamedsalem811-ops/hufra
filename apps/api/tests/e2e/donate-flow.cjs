// Browser walk-through of the donation website (plan 6.9), phone-sized Chromium.
// 1) npx tsx apps/api/tests/e2e/server.ts 8788 > /tmp/e2e.log &   2) node apps/api/tests/e2e/donate-flow.cjs /tmp/e2e.log [screenshot dir]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8788';
const OUT = process.argv[3] || require('os').tmpdir();
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').split('\n')[0]);
const FIX = require('path').resolve(__dirname, '../fixtures/photos/full.jpg');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('response', (r) => { if (r.status() >= 500) problems.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const step = async (name, fn) => { await fn(); console.log('ok', name); };

  await step('campaign (signed out)', async () => {
    await page.goto(`${BASE}/donate/${seed.campaign}`);
    await page.getByRole('heading', { name: 'شارع الجمهورية' }).waitFor();
    await page.getByText('0 د.ل مؤكدة من 1,200 د.ل').first().waitFor();
    await shot('01-campaign');
  });
  await step('donate asks to sign in', async () => {
    await page.getByRole('button', { name: 'تبرّع لإصلاحها' }).click();
    await page.getByRole('heading', { name: 'سجّل الدخول لتتبرع' }).waitFor();
    const href = await page.getByRole('link', { name: 'تسجيل الدخول' }).getAttribute('href');
    if (href !== `/login?redirect=%2Fdonate%2F${seed.campaign}`) throw new Error('login link ' + href);
    await shot('02-signin');
  });
  await step('sign in (cookie session)', async () => {
    const r = await page.evaluate(async () => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'donor@e2e.ly', password: 'Str0ngP@ssw0rd!' }) })).status);
    if (r !== 200) throw new Error('login ' + r);
  });
  await step('amount', async () => {
    await page.goto(`${BASE}/donate/${seed.campaign}`);
    await page.getByRole('button', { name: 'تبرّع لإصلاحها' }).click();
    await page.getByRole('heading', { name: 'كم تريد أن تتبرع؟' }).waitFor();
    await page.getByRole('button', { name: '50', exact: true }).click();
    await page.getByLabel('أظهر اسمي بين المتبرعين').check();
    await shot('03-amount');
    await page.getByRole('button', { name: 'متابعة' }).click();
  });
  let code;
  await step('step 1: bank details + code', async () => {
    await page.getByRole('heading', { name: 'التحويل' }).waitFor();
    await page.getByText('LY83 0020 4800 0020 1001 2036 1').waitFor();
    code = (await page.locator('.code').innerText()).trim();
    if (!/^HF-[A-Z2-9]{6}$/.test(code)) throw new Error('code ' + code);
    await shot('04-transfer');
  });
  await step('step 2: proof (compressed in the browser)', async () => {
    await page.getByRole('button', { name: 'حوّلت المبلغ، التالي' }).click();
    await page.getByRole('heading', { name: 'إثبات التحويل' }).waitFor();
    await page.getByLabel('كم حوّلت؟').fill('55.5');
    await page.locator('#shot').setInputFiles(FIX);
    await page.getByText(/تمت إضافة الصورة، صُغّرت إلى \d+ ك.ب/).waitFor();
    await shot('05-proof');
    await page.getByRole('button', { name: 'إرسال للمراجعة' }).click();
    await page.getByText('شكراً! وصلنا إثبات تبرعك').waitFor();
    await shot('06-thanks');
  });
  await step('campaign shows it as under review only', async () => {
    await page.goto(`${BASE}/donate/${seed.campaign}`);
    await page.getByText('55.5 د.ل قيد المراجعة، غير مؤكدة بعد').waitFor();
    await page.getByText('0 د.ل مؤكدة من 1,200 د.ل').first().waitFor();
    await shot('07-campaign-review');
  });
  await step('team confirms; receipt + wall', async () => {
    const queue = await (await fetch(`${BASE}/api/admin/donations`, { headers: { Authorization: `Bearer ${seed.owner}` } })).json();
    const id = queue.results[0].id;
    const r = await fetch(`${BASE}/api/admin/donations/${id}/review`, { method: 'POST', headers: { Authorization: `Bearer ${seed.owner}`, 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ decision: 'confirm' }) });
    if (r.status !== 200) throw new Error('review ' + r.status + ' ' + (await r.text()));
    await page.goto(`${BASE}/donations/${id}`);
    await page.getByRole('heading', { name: 'إيصال تبرع' }).waitFor();
    await shot('08-receipt');
    await page.goto(`${BASE}/donate/${seed.campaign}`);
    await page.getByText('55.5 د.ل مؤكدة من 1,200 د.ل').first().waitFor();
    await page.locator('.donor', { hasText: 'سالم' }).waitFor();
    await shot('09-campaign-confirmed');
  });
  await step('my donations', async () => {
    await page.goto(`${BASE}/donations`);
    await page.getByRole('heading', { name: 'تبرعاتي' }).waitFor();
    await page.getByText('55.5 د.ل').first().waitFor();
    await shot('10-mine');
  });
  await step('English', async () => {
    await page.goto(`${BASE}/donate/${seed.campaign}`);
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByText('LYD 55.5 confirmed of LYD 1,200').first().waitFor();
    if ((await page.getAttribute('html', 'dir')) !== 'ltr') throw new Error('dir');
    await shot('11-english');
    await page.getByRole('button', { name: 'العربية' }).click();
  });
  await step('dark mode', async () => {
    const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const p2 = await dark.newPage();
    await p2.goto(`${BASE}/donate/${seed.campaign}`);
    await p2.getByRole('heading', { name: 'شارع الجمهورية' }).waitFor();
    await p2.screenshot({ path: `${OUT}/12-dark.png`, fullPage: true });
    await dark.close();
  });

  await browser.close();
  if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
  console.log('ALL OK');
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
