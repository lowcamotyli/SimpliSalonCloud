"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"

interface RevenueChartProps {
    data: {
        date: string
        amount: number
    }[]
    title?: string
}

export default function RevenueChart({ data, title = "Przychody (ostatnie 7 dni)" }: RevenueChartProps) {
    return (
        <Card className="col-span-1 lg:col-span-2 glass border-none overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-gray-900">{title}</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6320ee" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6320ee" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#6b7280' }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#6b7280' }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}
                            formatter={(value: any) => [`${Number(value).toFixed(2)} zł`, 'Przychód']}
                        />
                        <Area
                            type="monotone"
                            dataKey="amount"
                            stroke="#6320ee"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorRevenue)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
