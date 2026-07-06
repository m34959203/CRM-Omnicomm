import { chromium, type Browser } from "playwright";

/**
 * PDF из print-HTML (печатные формы РК — двуязычные счёт/АВР/расшифровка).
 * Формы живут как HTML-роуты с print-CSS; для рассылки рендерим их в PDF
 * системным chromium. Браузер переиспользуется между вызовами.
 */
let browserPromise: Promise<Browser> | null = null;

const EXECUTABLE =
  process.env.CHROMIUM_PATH ??
  "/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";

async function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ executablePath: EXECUTABLE });
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      margin: { top: "14mm", bottom: "14mm", left: "16mm", right: "12mm" },
      printBackground: true,
    });
  } finally {
    await page.close();
  }
}
