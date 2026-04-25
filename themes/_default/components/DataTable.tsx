'use client'

import type * as React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DataTableProps } from '@/lib/themes/types'

export default function DefaultDataTable<TData>({ columns, data, className }: DataTableProps<TData>): JSX.Element {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => {
            const columnKey = String(column.key)

            return <TableHead key={columnKey}>{column.header}</TableHead>
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column) => {
              const columnKey = String(column.key)
              const content = column.cell
                ? column.cell(row)
                : String((row as Record<string, unknown>)[columnKey] ?? '')

              return <TableCell key={columnKey}>{content}</TableCell>
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
