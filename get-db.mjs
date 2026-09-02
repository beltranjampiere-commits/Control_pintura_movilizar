import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  console.log('Navegando a Odoo...');
  await page.goto('https://sumvehiculo-odoo15principal.odoo.com/web/login', { waitUntil: 'networkidle0' });
  
  console.log('Escribiendo credenciales...');
  await page.type('#login', 'rmachado@sum.pe');
  await page.type('#password', 'rmachado@');
  
  console.log('Iniciando sesión...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]')
  ]);
  
  console.log('Extrayendo DB...');
  const dbName = await page.evaluate(() => {
    return window.odoo && window.odoo.session_info ? window.odoo.session_info.db : 'Not found';
  });
  
  console.log('EXTRACTED_DB_NAME:', dbName);
  await browser.close();
})();
