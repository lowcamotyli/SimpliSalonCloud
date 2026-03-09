import { describe, it, expect } from 'vitest'
import { getRolePermissions, RBAC_ROLES } from '@/lib/rbac/role-maps'

describe('RBAC role maps', () => {
    it('owner has wildcard permission', () => {
        const permissions = getRolePermissions()
        expect(permissions[RBAC_ROLES.OWNER].includes('*')).toBe(true)
    })

    it('manager can manage employees and view finance', () => {
        const permissions = getRolePermissions()
        expect(permissions[RBAC_ROLES.MANAGER].includes('employees:manage')).toBe(true)
        expect(permissions[RBAC_ROLES.MANAGER].includes('finance:view')).toBe(true)
    })

    it('employee cannot view finance by default', () => {
        const permissions = getRolePermissions()
        expect(permissions[RBAC_ROLES.EMPLOYEE].includes('finance:view')).toBe(false)
    })
})
