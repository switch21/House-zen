/**
 * HOUSE-ZEN — Invoices (spec §14): DRAFT → ISSUED → (PARTIALLY_PAID) → PAID, VOID.
 * An issued invoice is immutable: corrections go through void + new invoice.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Send, Ban, Plus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';

/** Minimal HTML escaper for the printable document template. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Printable invoice (spec §14): opens a print window whose header carries the
 * establishment branding (logo, address, contacts, tax ids) — the header data
 * is exactly what Settings → Général maintains (migration 057 columns).
 */
async function printInvoiceDocument(
  inv: Record<string, unknown>,
  opts: { locale: string; labels: Record<string, string> },
): Promise<void> {
  const [itemsRes, tenantsRes] = await Promise.all([
    getDataApi().list<Record<string, unknown>>('invoice_items', {
      filters: { invoice_id: String(inv.id) }, pageSize: 200,
    }),
    getDataApi().list<Record<string, unknown>>('tenants', { pageSize: 1 }),
  ]);
  const ten = tenantsRes.items[0] ?? {};
  const cur = String(inv.currency ?? ten.currency ?? 'XAF');
  const fmt = (n: unknown) => formatMoney(Number(n ?? 0), cur, opts.locale);
  const L = (k: string) => esc(opts.labels[k] ?? k);
  const items = itemsRes.items.map((it) => `
    <tr>
      <td>${esc(it.description)}</td>
      <td class="num">${esc(it.quantity)}</td>
      <td class="num">${fmt(it.unit_price)}</td>
      <td class="num">${fmt(it.total)}</td>
    </tr>`).join('');
  const balance = Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0);
  const logo = typeof ten.logo_url === 'string' && ten.logo_url
    ? `<img src="${esc(ten.logo_url)}" alt="logo" />`
    : '';
  const addrLine = [ten.address_line, ten.city, ten.country].filter(Boolean).map(esc).join(', ');
  const contactLine = [ten.phone, ten.contact_email, ten.website].filter(Boolean).map(esc).join(' · ');
  const legalLine = [ten.tax_id ? `${L('invoices.printTaxId')} : ${esc(ten.tax_id)}` : '',
    ten.registration_no ? `${L('invoices.printRegNo')} : ${esc(ten.registration_no)}` : '']
    .filter(Boolean).join(' · ');
  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${esc(inv.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 32px; }
    header { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
    header img { max-height: 72px; max-width: 180px; object-fit: contain; }
    .est-name { font-size: 20px; font-weight: bold; margin: 4px 0 2px; }
    .est-meta { font-size: 11px; color: #444; line-height: 1.5; }
    .doc-title { font-size: 26px; letter-spacing: 2px; text-transform: uppercase; }
    .doc-meta { text-align: right; font-size: 12px; color: #333; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
    th { border-bottom: 2px solid #1a1a1a; text-align: left; padding: 6px 8px; }
    td { border-bottom: 1px solid #ddd; padding: 6px 8px; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 14px; margin-left: auto; width: 46%; font-size: 12px; }
    .totals td { border: none; padding: 3px 8px; }
    .totals .grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 14px; }
    footer { margin-top: 40px; font-size: 10px; color: #666; text-align: center; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
  <header>
    <div class="est-meta">
      ${logo}
      <div class="est-name">${esc(ten.name ?? '')}</div>
      ${addrLine ? `<div>${addrLine}</div>` : ''}
      ${contactLine ? `<div>${contactLine}</div>` : ''}
      ${legalLine ? `<div>${legalLine}</div>` : ''}
    </div>
    <div class="doc-meta">
      <div class="doc-title">${L('invoices.title')}</div>
      <div><strong>${esc(inv.number)}</strong></div>
      <div>${L('invoices.issuedAt')} : ${esc(inv.issued_at ? String(inv.issued_at).slice(0, 10) : '—')}</div>
      <div>${L('common.status')} : ${esc(inv.status)}</div>
    </div>
  </header>
  <table>
    <thead><tr>
      <th>${L('invoices.itemDesc')}</th><th class="num">${L('invoices.itemQty')}</th>
      <th class="num">${L('invoices.itemUnit')}</th><th class="num">${L('invoices.itemTotal')}</th>
    </tr></thead>
    <tbody>${items || `<tr><td colspan="4" style="text-align:center;color:#888">—</td></tr>`}</tbody>
  </table>
  <table class="totals">
    <tr><td>${L('invoices.subtotal')}</td><td class="num">${fmt(inv.subtotal)}</td></tr>
    <tr><td>${L('invoices.tax')}</td><td class="num">${fmt(inv.tax_total)}</td></tr>
    <tr class="grand"><td>${L('common.total')}</td><td class="num">${fmt(inv.total)}</td></tr>
    <tr><td>${L('invoices.paid')}</td><td class="num">${fmt(inv.amount_paid)}</td></tr>
    <tr><td>${L('invoices.balance')}</td><td class="num"><strong>${fmt(balance)}</strong></td></tr>
  </table>
  <footer>${L('invoices.printFooter')} — ${esc(ten.name ?? '')}</footer>
  </body></html>`;
  const win = window.open('', '_blank', 'width=860,height=940');
  if (!win) throw new Error('popup-blocked');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

const INVOICE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  DRAFT: { label: 'DRAFT', variant: 'secondary' },
  ISSUED: { label: 'ISSUED', variant: 'warning' },
  PARTIALLY_PAID: { label: 'PARTIALLY_PAID', variant: 'default' },
  PAID: { label: 'PAID', variant: 'success' },
  VOID: { label: 'VOID', variant: 'destructive' },
};

export default function InvoicesPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reservationId, setReservationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const { data: invoices, isLoading } = useEntityList<Record<string, unknown>>('invoices', {
    sort: { created_at: 'desc' },
    pageSize: 200,
  });
  const { data: reservations } = useEntityList<Record<string, unknown>>('reservations', {
    pageSize: 500,
    filters: { status: 'CHECKED_IN' },
  });

  const refresh = () => {
    ['invoices', 'invoice_items', 'audit_logs', 'notifications'].forEach((e) =>
      qc.invalidateQueries({ queryKey: ['hz', e] }),
    );
  };

  const issue = useMutation({
    mutationFn: (id: UUID) => getDataApi().issueInvoice(id),
    onSuccess: refresh,
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const voidInvoice = useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason: string }) => getDataApi().voidInvoice(id, reason),
    onSuccess: refresh,
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const createFromReservation = useMutation({
    mutationFn: (rid: string) => getDataApi().createInvoiceFromReservation(rid),
    onSuccess: () => {
      setCreateOpen(false);
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('invoices.title')}
        description={t('invoices.issuedHint')}
        actions={
          <Button onClick={() => { setError(null); setCreateOpen(true); }}>
            <Plus size={16} /> {t('invoices.create')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !invoices || invoices.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoices.number')}</TableHead>
                  <TableHead>{t('invoices.subtotal')}</TableHead>
                  <TableHead>{t('invoices.tax')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('invoices.paid')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.items.map((inv) => {
                  const status = String(inv.status);
                  return (
                    <TableRow key={String(inv.id)}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <FileText size={13} className="text-muted-foreground" />
                          {String(inv.number)}
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(Number(inv.subtotal), String(inv.currency), locale)}</TableCell>
                      <TableCell>{formatMoney(Number(inv.tax_total), String(inv.currency), locale)}</TableCell>
                      <TableCell className="font-semibold">{formatMoney(Number(inv.total), String(inv.currency), locale)}</TableCell>
                      <TableCell>{formatMoney(Number(inv.amount_paid), String(inv.currency), locale)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={status}
                          map={Object.fromEntries(
                            Object.entries(INVOICE_MAP).map(([k, v]) => [k, { ...v, label: t(`invoiceStatus.${k}`) }]),
                          )}
                        />
                      </TableCell>
                      <TableCell>{inv.issued_at ? formatDateTime(String(inv.issued_at), undefined, locale) : '—'}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {status === 'DRAFT' ? (
                            <Button size="sm" variant="outline" onClick={() => issue.mutate(String(inv.id))}>
                              <Send size={13} /> {t('invoices.issue')}
                            </Button>
                          ) : null}
                          {status !== 'DRAFT' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('invoices.print')}
                              onClick={() => {
                                setPrintError(null);
                                printInvoiceDocument(inv, {
                                  locale,
                                  labels: {
                                    'invoices.title': t('invoices.title'),
                                    'invoices.issuedAt': t('invoices.issuedAt'),
                                    'invoices.printTaxId': t('invoices.printTaxId'),
                                    'invoices.printRegNo': t('invoices.printRegNo'),
                                    'invoices.itemDesc': t('invoices.itemDesc'),
                                    'invoices.itemQty': t('invoices.itemQty'),
                                    'invoices.itemUnit': t('invoices.itemUnit'),
                                    'invoices.itemTotal': t('invoices.itemTotal'),
                                    'invoices.subtotal': t('invoices.subtotal'),
                                    'invoices.tax': t('invoices.tax'),
                                    'invoices.paid': t('invoices.paid'),
                                    'invoices.balance': t('invoices.balance'),
                                    'invoices.printFooter': t('invoices.printFooter'),
                                    'common.total': t('common.total'),
                                    'common.status': t('common.status'),
                                  },
                                }).catch(() => setPrintError(t('invoices.printError')));
                              }}
                            >
                              <Printer size={14} />
                            </Button>
                          ) : null}
                          {['DRAFT', 'ISSUED', 'PARTIALLY_PAID'].includes(status) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('invoices.void')}
                              onClick={() => {
                                const reason = window.prompt('Motif ?') ?? '';
                                if (reason) voidInvoice.mutate({ id: String(inv.id), reason });
                              }}
                            >
                              <Ban size={14} className="text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {printError ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{printError}</p>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <UiSelect value={reservationId} onValueChange={setReservationId}>
              <SelectTrigger><SelectValue placeholder={t('reservations.title')} /></SelectTrigger>
              <SelectContent>
                {(reservations?.items ?? []).map((r) => (
                  <SelectItem key={String(r.id)} value={String(r.id)}>
                    {String(r.reference)} — {String(r.check_in_date)}→{String(r.check_out_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!reservationId || createFromReservation.isPending}
              onClick={() => createFromReservation.mutate(reservationId)}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
