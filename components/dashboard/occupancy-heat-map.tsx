'use client'

interface HeatMapData {
    day: string
    hour: number
    value: number
}

interface OccupancyHeatMapProps {
    data: HeatMapData[]
}

const DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8:00 - 20:00

export default function OccupancyHeatMap({ data }: OccupancyHeatMapProps) {
    // Group data by day and hour for easy lookups
    const matrix: Record<string, Record<number, number>> = {}
    data.forEach(item => {
        if (!matrix[item.day]) matrix[item.day] = {}
        matrix[item.day][item.hour] = item.value
    })

    const maxValue = Math.max(...data.map(d => d.value), 1)

    const getColor = (value: number) => {
        if (value === 0) return 'bg-gray-50'
        const intensity = value / maxValue
        if (intensity < 0.2) return 'bg-primary/10 text-primary'
        if (intensity < 0.4) return 'bg-primary/30 text-primary'
        if (intensity < 0.6) return 'bg-primary/50 text-white'
        if (intensity < 0.8) return 'bg-primary/70 text-white'
        return 'bg-primary text-white'
    }

    return (
        <div className="w-full overflow-x-auto">
            <div className="min-w-[700px]">
                <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
                    <div /> {/* Top-left spacer */}
                    {DAYS.map(day => (
                        <div key={day} className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-2">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    {HOURS.map(hour => (
                        <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 items-center">
                            <div className="text-right pr-4 text-xs font-bold text-gray-400">
                                {hour}:00
                            </div>
                            {DAYS.map(day => {
                                const val = matrix[day]?.[hour] || 0
                                return (
                                    <div
                                        key={`${day}-${hour}`}
                                        className={`aspect-square sm:aspect-auto sm:h-12 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300 hover:scale-105 hover:shadow-md cursor-default ${getColor(val)}`}
                                        title={`${day} ${hour}:00 - Wizyt: ${val}`}
                                    >
                                        {val > 0 ? val : ''}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex items-center justify-end gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">Małe obłożenie</span>
                        <div className="flex gap-1">
                            <div className="w-4 h-4 rounded bg-primary/10" />
                            <div className="w-4 h-4 rounded bg-primary/50" />
                            <div className="w-4 h-4 rounded bg-primary" />
                        </div>
                        <span className="text-xs text-gray-500 font-medium">Duże obłożenie</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
