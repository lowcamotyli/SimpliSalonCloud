import test from 'node:test'
import assert from 'node:assert/strict'
import { getRolePermissions, RBAC_ROLES } from '@/lib/rbac/role-maps'

test('rbac owner has wildcard permission', () => {
    const permissions = getRolePermissions()
    assert.equal(permissions[RBAC_ROLES.OWNER].includes('*'), true)
})

test('rbac manager can manage employees and view finance', () => {
    const permissions = getRolePermissions()
    assert.equal(permissions[RBAC_ROLES.MANAGER].includes('employees:manage'), true)
    assert.equal(permissions[RBAC_ROLES.MANAGER].includes('finance:view'), true)
})

test('rbac employee cannot view finance by default', () => {
    const permissions = getRolePermissions()
    assert.equal(permissions[RBAC_ROLES.EMPLOYEE].includes('finance:view'), false)
})

