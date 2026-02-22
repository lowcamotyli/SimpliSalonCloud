import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function Loading() {
    return (
        <div className="max-w-[1400px] mx-auto space-y-6 pb-10 px-4 sm:px-0">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64 rounded-lg" />
                    <Skeleton className="h-4 w-96 rounded-md" />
                </div>
                <Skeleton className="h-10 w-32 rounded-lg" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Current Plan Card Skeleton */}
                    <Card className="p-6 space-y-6">
                        <div className="flex justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-10 w-48" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-8 w-24 rounded-full" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-gray-100">
                            <Skeleton className="h-10 w-32 rounded-lg" />
                            <Skeleton className="h-10 w-40 rounded-lg" />
                        </div>
                    </Card>

                    {/* Usage Stats Skeleton */}
                    <Card className="p-6 space-y-6">
                        <div className="flex justify-between">
                            <Skeleton className="h-6 w-48" />
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-4 w-12" />
                                </div>
                                <Skeleton className="h-2.5 w-full rounded-full" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-4 w-12" />
                                </div>
                                <Skeleton className="h-2.5 w-full rounded-full" />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    {/* Payment Method Skeleton */}
                    <Card className="p-6 space-y-4">
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                    </Card>

                    {/* Przelewy24 Placeholder Skeleton */}
                    <Card className="overflow-hidden">
                        <Skeleton className="h-16 w-full" />
                        <div className="p-6 space-y-4">
                            <Skeleton className="h-20 w-full rounded-xl" />
                            <div className="grid grid-cols-3 gap-2">
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
