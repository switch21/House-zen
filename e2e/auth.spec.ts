/**
 * HOUSE-ZEN — E2E: authentication, RBAC UI gating and session lifecycle.
 * Demo accounts (documented): all passwords `demo1234`.
 */

import { expect, test, type Page } from '@playwright/test';

const OWNER = { email: 'owner@demo.house-zen.app', password: 'demo1234' };

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /se connecter/i }).click();
}

test.describe('authentication & RBAC', () => {
  test('owner signs in and reaches the dashboard', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.waitForURL('**/app/dashboard');
    await expect(page.getByText('Zen Hôtels & Résidences').first()).toBeVisible();
    // Sidebar core navigation is present.
    await expect(page.getByRole('link', { name: /réservations/i })).toBeVisible();
  });

  test('wrong credentials are rejected with an explicit error', async ({ page }) => {
    await login(page, OWNER.email, 'wrong-password');
    await expect(page.getByText(/identifiants invalides/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('housekeeping role sees scoped navigation and 403 on finance', async ({ page }) => {
    await login(page, 'menage@demo.house-zen.app', OWNER.password);
    await page.waitForURL('**/app/dashboard');
    // Finance links are hidden for housekeeping (RBAC UX layer).
    await expect(page.getByRole('link', { name: /factures/i })).toHaveCount(0);
    // Direct access is still blocked by the route guard.
    await page.goto('/app/invoices');
    await expect(page.getByText('403')).toBeVisible();
  });

  test('sign out returns to the login page', async ({ page }) => {
    await login(page, OWNER.email, OWNER.password);
    await page.waitForURL('**/app/dashboard');
    await page.getByRole('button', { name: 'logout' }).click();
    await page.waitForURL('**/login');
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible();
  });
});
