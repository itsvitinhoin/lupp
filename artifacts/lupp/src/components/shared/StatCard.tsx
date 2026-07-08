import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
}

export function StatCard({ title, value, icon: Icon, trend, trendLabel }: StatCardProps) {
  return (
    <Card className="overflow-hidden bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-destructive'}`}>
              {trend >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
              <span>{Math.abs(trend)}%</span>
            </div>
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</h3>
        </div>
        {trendLabel && (
          <p className="mt-1 text-xs text-slate-500">{trendLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}
