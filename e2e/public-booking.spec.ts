/**
 * HOUSE-ZEN — E2E: anonymous public booking journey (/book/:propertySlug).
 * Mirrors the verified browser path: search → choose room type → guest
 * details → confirmation with an immutable reference.
 */

import { expect, test } from '@playwright/test';

test.describe('public booking', () => {
  test('a guest books a room end-to-end and receives a reference', async ({ page }) => {
    await page.goto('/book/zen-palace-douala');
    await expect(page.getByRole('heading', { name: 'Zen Palace Douala' })).toBeVisible();

    // Search availability.
    await page.locator('#pub-ci').fill('2026-12-01');
    await page.locator('#pub-co').fill('2026-12-03');
    await page.locator('#pub-adults').fill('2');
    await page.getByRole('button', { name: /rechercher une disponibilité/i }).click();

    // Results list shows available room types with a book button.
    const bookButtons = page.getByRole('button', { name: /réserver maintenant/i });
    await expect(bookButtons.first()).toBeVisible();
    await bookButtons.first().click();

    // Guest details + summary.
    await page.locator('#g-name').fill('Client E2E');
    await page.locator('#g-email').fill('e2e@house-zen.test');
    await page.locator('#g-phone').fill('+237 600 00 00 01');
    await page.locator('#g-country').fill('Cameroun');
    await expect(page.getByText(/récapitulatif/i)).toBeVisible();

    // Submit the booking: the form button is the LAST "Réserver maintenant"
    // in the DOM (the other room-type cards keep their own book buttons).
    await page.getByRole('button', { name: /réserver maintenant/i }).last().click();

    // Confirmation with an immutable reference.
    await expect(page.getByText(/réservation confirmée/i)).toBeVisible();
    await expect(page.getByText(/HZ-2026-\d{4}/)).toBeVisible();
  });

  test('unknown property slug renders a not-found state', async ({ page }) => {
    await page.goto('/book/property-inconnue');
    await expect(page.getByText(/introuvable|not found|aucune|page/i)).toBeVisible();
  });
});
