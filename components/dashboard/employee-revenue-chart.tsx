'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts"

interface EmployeeRevenueChartProps {
    data: {
        name: string
        amount: number
    }[]
}

const COLORS = ['#6320ee', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899']

export default function EmployeeRevenueChart({ data }: EmployeeRevenueChartProps) {
    return (
        <Card className="glass border-none overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-gray-900">Przychód wg pracowników (7 dni)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 600 }}
                            width={100}
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
                        <Bar
                            dataKey="amount"
                            radius={[0, 10, 10, 0]}
                            barSize={32}
                            animationDuration={1500}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
