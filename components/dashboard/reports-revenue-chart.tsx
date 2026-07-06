'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatReportsCurrency } from '@/lib/reports'

const revenueChartConfig = {
  billed: {
    label: 'Billed',
    color: 'var(--chart-1)',
  },
  collected: {
    label: 'Collected',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

type RevenueMonth = {
  monthLabel: string
  billed: number
  collected: number
}

export function ReportsRevenueChart({ data }: { data: RevenueMonth[] }) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
        No billing activity in this period yet.
      </div>
    )
  }

  return (
    <ChartContainer
      config={revenueChartConfig}
      className="aspect-auto h-72 w-full"
      initialDimension={{ width: 640, height: 288 }}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="monthLabel"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) =>
            value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                formatReportsCurrency(typeof value === 'number' ? value : Number(value) || 0)
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}