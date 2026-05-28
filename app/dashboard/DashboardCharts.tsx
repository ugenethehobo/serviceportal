'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'

interface RevenueDataPoint {
  month: string
  revenue: number
}

interface PieDataPoint {
  name: string
  value: number
  color: string
}

interface DashboardChartsProps {
  revenueTrendData: RevenueDataPoint[]
  statusPieData: PieDataPoint[]
  primaryColor?: string | null
  mtdRevenue: number
}

export function DashboardCharts({ 
  revenueTrendData, 
  statusPieData, 
  primaryColor, 
  mtdRevenue 
}: DashboardChartsProps) {
  const chartColor = primaryColor || '#0ea5e9'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Revenue Trend */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Revenue (last 6 months)</div>
        <div className="h-52 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => '$' + v} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => ['$' + value, 'Revenue']} />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke={chartColor} 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: chartColor }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Job Status Mix */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Current job mix</div>
        <div className="h-52">
          {statusPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No jobs yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
