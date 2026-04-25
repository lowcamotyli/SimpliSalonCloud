import type * as React from 'react'

export type ColorScale = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  variant?: 'default' | 'destructive' | 'outline' | 'ghost'
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  variant?: 'default' | 'outlined' | 'elevated'
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
  options?: Array<{ label: string; value: string; disabled?: boolean }>
  placeholder?: string
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string
}

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  className?: string
  label?: React.ReactNode
}

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  className?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export interface DatePickerProps {
  className?: string
  value?: Date
  onChange?: (value: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export interface DateRangePickerProps {
  className?: string
  value?: { from?: Date; to?: Date }
  onChange?: (value: { from?: Date; to?: Date } | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export interface TimePickerProps {
  className?: string
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  name?: string
  label?: React.ReactNode
  message?: React.ReactNode
  error?: React.ReactNode
}

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  className?: string
}

export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  className?: string
  variant?: 'default' | 'error' | 'success'
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string
  variant?: 'default' | 'success' | 'warning' | 'destructive'
}

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  className?: string
  variant?: 'default' | 'success' | 'warning' | 'destructive'
  title?: React.ReactNode
  description?: React.ReactNode
}

export interface DataTableProps<TData> {
  className?: string
  data: TData[]
  columns: Array<{
    key: keyof TData | string
    header: React.ReactNode
    cell?: (row: TData) => React.ReactNode
  }>
  emptyMessage?: React.ReactNode
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  src?: string
  alt?: string
  fallback?: React.ReactNode
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  className?: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  label?: React.ReactNode
  value?: React.ReactNode
  description?: React.ReactNode
  trend?: React.ReactNode
}

export interface FileUploadProps {
  className?: string
  accept?: string
  multiple?: boolean
  disabled?: boolean
  onFilesChange?: (files: File[]) => void
}

export interface ModalProps {
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
}

export interface SheetProps extends ModalProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export interface ConfirmDialogProps extends ModalProps {
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  onConfirm?: () => void
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  className?: string
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  className?: string
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export interface TabsProps {
  className?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  value: string
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  value: string
}

export interface IconButtonProps extends ButtonProps {
  label: string
}

export interface DropdownMenuProps {
  className?: string
  trigger?: React.ReactNode
  items?: Array<{
    label: React.ReactNode
    onSelect?: () => void
    disabled?: boolean
  }>
  children?: React.ReactNode
}

export interface TooltipProps {
  className?: string
  content: React.ReactNode
  children: React.ReactNode
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  className?: string
  items?: Array<{ label: React.ReactNode; href?: string }>
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  className?: string
  items?: Array<{ label: React.ReactNode; href?: string; icon?: React.ReactNode; active?: boolean }>
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  className?: string
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

export interface ToastAPI {
  success(msg: string): void
  error(msg: string): void
  info(msg: string): void
}

export interface ComponentRegistry {
  PageHeader: React.ComponentType<PageHeaderProps>
  Card: React.ComponentType<CardProps>
  CardHeader: React.ComponentType<CardHeaderProps>
  Section: React.ComponentType<SectionProps>
  Input: React.ComponentType<InputProps>
  Select: React.ComponentType<SelectProps>
  Textarea: React.ComponentType<TextareaProps>
  Checkbox: React.ComponentType<CheckboxProps>
  Switch: React.ComponentType<SwitchProps>
  DatePicker: React.ComponentType<DatePickerProps>
  DateRangePicker: React.ComponentType<DateRangePickerProps>
  TimePicker: React.ComponentType<TimePickerProps>
  FormField: React.ComponentType<FormFieldProps>
  FormLabel: React.ComponentType<FormLabelProps>
  FormMessage: React.ComponentType<FormMessageProps>
  Button: React.ComponentType<ButtonProps>
  IconButton: React.ComponentType<IconButtonProps>
  DropdownMenu: React.ComponentType<DropdownMenuProps>
  Badge: React.ComponentType<BadgeProps>
  Alert: React.ComponentType<AlertProps>
  Toast: ToastAPI
  Tooltip: React.ComponentType<TooltipProps>
  DataTable: <TData>(props: DataTableProps<TData>) => React.ReactElement
  Avatar: React.ComponentType<AvatarProps>
  EmptyState: React.ComponentType<EmptyStateProps>
  StatCard: React.ComponentType<StatCardProps>
  FileUpload: React.ComponentType<FileUploadProps>
  Tabs: React.ComponentType<TabsProps>
  TabsList: React.ComponentType<{ className?: string; children: React.ReactNode }>
  TabsTrigger: React.ComponentType<TabsTriggerProps>
  TabsContent: React.ComponentType<TabsContentProps>
  Breadcrumb: React.ComponentType<BreadcrumbProps>
  Sidebar: React.ComponentType<SidebarProps>
  Modal: React.ComponentType<ModalProps>
  Sheet: React.ComponentType<SheetProps>
  ConfirmDialog: React.ComponentType<ConfirmDialogProps>
  Skeleton: React.ComponentType<SkeletonProps>
  Spinner: React.ComponentType<SpinnerProps>
}

export interface DesignTokens {
  colors: {
    primary: ColorScale
    secondary: ColorScale
    accent: ColorScale
    neutral: ColorScale
    destructive: ColorScale
    success: ColorScale
    warning: ColorScale
    background: string
    surface: string
    border: string
    foreground: string
  }
  typography: {
    fontFamily: { sans: string; mono: string }
    fontSize: Record<'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl', string>
  }
  borderRadius: Record<'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full', string>
  shadows: Record<'none' | 'sm' | 'md' | 'lg' | 'xl', string>
  motion: {
    duration: Record<'fast' | 'normal' | 'slow', string>
  }
}
