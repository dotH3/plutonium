import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activePages = 0;

  async init(): Promise<void> {
    if (this.browser) return;
    console.log('[BrowserManager] Lanzando Chromium...');
    this.browser = await chromium.launch({ headless: true, slowMo: 150 });
    this.context = await this.browser.newContext();
    console.log('[BrowserManager] Chromium listo.');
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('BrowserManager no inicializado. Llamá a init() primero.');
    }
    this.activePages++;
    return this.context.newPage();
  }

  async closePage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch {
      // ignorar
    }
    this.activePages = Math.max(0, this.activePages - 1);
  }

  async shutdown(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignorar
      }
      this.context = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignorar
      }
      this.browser = null;
    }
    this.activePages = 0;
  }

  getActivePages(): number {
    return this.activePages;
  }
}

export const browserManager = new BrowserManager();
