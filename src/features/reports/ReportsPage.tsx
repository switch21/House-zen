/**
 * HOUSE-ZEN — Reports (PHASE 7): occupancy/ADR/RevPAR over the window + CSV export.
 */

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatCard } from '@/components/layout/shared';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import { formatMoney } from '@/lib/utils/money-dates';
import type { KPIs } from '@/lib/api/types';

function exportCsv(rows: (string | number)[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const currency = session?.tenant?.currency ?? 'XAF';

  const { data: kpis } = useQuery({
    queryKey: ['hz', 'kpis', session?.tenant?.id ?? 'none'],
    queryFn: () => getDataApi().kpis(session?.tenant?.id ?? ''),
    enabled: Boolean(session?.tenant),
  });

  const k = kpis as KPIs | undefined;

  function handleExport() {
    if (!k) return;
    const rows: (string | number)[][] = [['date', 'revenue', 'expenses', 'occupancy_pct']];
    k.revenueSeries.forEach((r, i) => {
      rows.push([r.date, r.revenue, r.expenses, k.occupancySeries[i]?.rate ?? 0]);
    });
    exportCsv(rows, `house-zen-report-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('reports.title')}
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download size={15} /> {t('reports.exportCsv')}
          </Button>
        }
      />

      {k ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t('reports.occupancy')} value={`${k.occupancyRate}%`} />
            <StatCard label={t('reports.adr')} value={formatMoney(k.adr, currency, locale)} />
            <StatCard label={t('reports.revpar')} value={formatMoney(k.revpar, currency, locale)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('reports.exports')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th className="p-2 text-start">{t('common.date')}</th>
                      <th className="p-2 text-end">{t('reports.revenue')}</th>
                      <th className="p-2 text-end">{t('nav.expenses')}</th>
                      <th className="p-2 text-end">{t('reports.occupancy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.revenueSeries.map((r, i) => (
                      <tr key={r.date} className="border-b last:border-0">
                        <td className="p-2">{r.date}</td>
                        <td className="p-2 text-end">{formatMoney(r.revenue, currency, locale)}</td>
                        <td className="p-2 text-end text-muted-foreground">{formatMoney(r.expenses, currency, locale)}</td>
                        <td className="p-2 text-end">{k.occupancySeries[i]?.rate ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      )}
    </div>
  );
}
