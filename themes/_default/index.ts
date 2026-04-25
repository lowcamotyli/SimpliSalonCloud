import type * as React from 'react'

import Button from './components/Button'
import Card, { DefaultCardHeader } from './components/Card'
import Input from './components/Input'
import Select from './components/Select'
import Badge from './components/Badge'
import Modal from './components/Modal'
import Sheet from './components/Sheet'
import Tabs from './components/Tabs'
import TabsList from './components/TabsList'
import TabsTrigger from './components/TabsTrigger'
import TabsContent from './components/TabsContent'
import Skeleton from './components/Skeleton'
import Avatar from './components/Avatar'
import DataTable from './components/DataTable'
import EmptyState from './components/EmptyState'
import Spinner from './components/Spinner'
import tokensSource from './tokens'
import type { ComponentRegistry, DesignTokens, ToastAPI } from '@/lib/themes/types'

const tokens: DesignTokens = tokensSource

const NoopComponent = (() => null) as React.ComponentType<any>

const Toast: ToastAPI = {
  success: (_msg: string): void => {},
  error: (_msg: string): void => {},
  info: (_msg: string): void => {},
}

const registry: ComponentRegistry = {
  PageHeader: NoopComponent,
  Card,
  CardHeader: DefaultCardHeader,
  Section: NoopComponent,
  Input,
  Select,
  Textarea: NoopComponent,
  Checkbox: NoopComponent,
  Switch: NoopComponent,
  DatePicker: NoopComponent,
  DateRangePicker: NoopComponent,
  TimePicker: NoopComponent,
  FormField: NoopComponent,
  FormLabel: NoopComponent,
  FormMessage: NoopComponent,
  Button,
  IconButton: Button as unknown as ComponentRegistry['IconButton'],
  DropdownMenu: NoopComponent,
  Badge,
  Alert: NoopComponent,
  Toast,
  Tooltip: NoopComponent,
  DataTable,
  Avatar,
  EmptyState,
  StatCard: NoopComponent,
  FileUpload: NoopComponent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Breadcrumb: NoopComponent,
  Sidebar: NoopComponent,
  Modal,
  Sheet,
  ConfirmDialog: Modal as unknown as ComponentRegistry['ConfirmDialog'],
  Skeleton,
  Spinner,
}

export { registry, tokens }

export default { registry, tokens }
