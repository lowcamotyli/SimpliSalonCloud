"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts"

interface ServicesChartProps {
    data: {
        name: string
        value: number
    }[]
}

const COLORS = ['#6320ee', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899']

export default function ServicesChart({ data }: ServicesChartProps) {
    return (
        <Card className="glass border-none overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold text-gray-900">Popularność usług</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            animationDuration={1500}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
