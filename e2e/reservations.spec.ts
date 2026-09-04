/**
 * HOUSE-ZEN — E2E: back-office reservation creation through the single
 * atomic engine (customer → room type → room → quote → confirm → reference).
 */

import { expect, test, type Page } from '@playwright/test';

async function loginOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', 'owner@demo.house-zen.app');
  await page.fill('#password', 'demo1234');
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.waitForURL('**/app/dashboard');
}

test.describe('back-office reservations', () => {
  test('creates a reservation and the reference appears in the list', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/app/reservations');
    await expect(page.getByText(/HZ-2026-0001/).first()).toBeVisible();

    await page.getByRole('button', { name: /nouvelle réservation/i }).click();

    // The dialog opens with customer and room type pre-selected; only the
    // room must be picked (placeholder 'Sélectionner une chambre').
    await page.getByRole('combobox').filter({ hasText: /sélectionner une chambre/i }).click();
    await page.getByRole('option').first().click();

    // Confirm INSIDE the dialog (list rows may carry their own Confirmer buttons).
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();

    // The seed counter ends at 0010 → the new reservation is 0011.
    await expect(page.getByText('HZ-2026-0011')).toBeVisible();
  });

  test('reservation list exposes the status pipeline actions', async ({ page }) => {
    await loginOwner(page);
    await page.goto('/app/reservations');
    // A CONFIRMED future reservation offers check-in ("Faire arriver").
    await expect(page.getByRole('button', { name: /faire arriver/i }).first()).toBeVisible();
  });
});
