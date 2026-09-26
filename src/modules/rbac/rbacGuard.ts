import type {
  UserRole,
  RbacPermission,
  RouteRule,
  RbacAuthResult,
} from '../../types/index.js';

export const ALL_INSTITUTIONAL_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'REGISTRAR',
  'DEAN',
  'HOD',
  'FACULTY',
  'STUDENT',
  'PARENT',
  'COE',
  'FINANCE_OFFICER',
  'LIBRARIAN',
  'WARDEN',
  'MENTOR',
];

export class RbacGuard {
  /**
   * Complete institutional role-to-permissions matrix
   * Covering all 12 higher-education institutional roles
   */
  private rolePermissionsMap: Record<UserRole, Set<RbacPermission>> = {
    SUPER_ADMIN: new Set<RbacPermission>([
      'SYSTEM_MANAGE',
      'USER_MANAGE',
      'CALENDAR_MANAGE',
      'CURRICULUM_MANAGE',
      'COURSE_OFFER',
      'COURSE_REGISTER',
      'ADD_DROP_COURSE',
      'ATTENDANCE_MARK',
      'ATTENDANCE_OVERRIDE',
      'ATTENDANCE_VIEW_ALL',
      'ATTENDANCE_VIEW_SELF',
      'ATTENDANCE_VIEW_WARD',
      'GRADE_ENTER',
      'GRADE_OVERRIDE',
      'GRADE_LOCK',
      'GRADE_PUBLISH',
      'SEATING_GENERATE',
      'OSV_EVALUATE',
      'OSV_ARBITRATE',
      'LEAVE_APPLY_SELF',
      'LEAVE_APPLY_WARD',
      'LEAVE_APPROVE_MENTOR',
      'LEAVE_APPROVE_HOD',
      'FEE_COLLECT',
      'FEE_RECONCILE',
      'FEE_PAY',
      'FEE_VIEW',
      'LIBRARY_CIRCULATE',
      'LIBRARY_CATALOG_MANAGE',
      'LIBRARY_FINE_COLLECT',
      'GRIEVANCE_FILE',
      'GRIEVANCE_INVESTIGATE',
      'GRIEVANCE_RESOLVE',
      'FEEDBACK_SUBMIT',
      'FEEDBACK_ANALYZE',
      'GUARDIAN_LINK_MANAGE',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    REGISTRAR: new Set<RbacPermission>([
      'USER_MANAGE',
      'CALENDAR_MANAGE',
      'CURRICULUM_MANAGE',
      'COURSE_OFFER',
      'COURSE_REGISTER',
      'ADD_DROP_COURSE',
      'ATTENDANCE_VIEW_ALL',
      'GRADE_LOCK',
      'GRADE_PUBLISH',
      'SEATING_GENERATE',
      'FEE_VIEW',
      'LIBRARY_CIRCULATE',
      'FEEDBACK_ANALYZE',
      'GUARDIAN_LINK_MANAGE',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    DEAN: new Set<RbacPermission>([
      'CALENDAR_MANAGE',
      'CURRICULUM_MANAGE',
      'COURSE_OFFER',
      'ATTENDANCE_VIEW_ALL',
      'GRADE_LOCK',
      'GRADE_PUBLISH',
      'LEAVE_APPROVE_HOD',
      'GRIEVANCE_INVESTIGATE',
      'GRIEVANCE_RESOLVE',
      'FEEDBACK_ANALYZE',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    HOD: new Set<RbacPermission>([
      'COURSE_OFFER',
      'ATTENDANCE_OVERRIDE',
      'ATTENDANCE_VIEW_ALL',
      'GRADE_ENTER',
      'GRADE_OVERRIDE',
      'LEAVE_APPROVE_HOD',
      'GRIEVANCE_INVESTIGATE',
      'FEEDBACK_ANALYZE',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    FACULTY: new Set<RbacPermission>([
      'ATTENDANCE_MARK',
      'ATTENDANCE_OVERRIDE',
      'GRADE_ENTER',
      'GRADE_OVERRIDE',
      'LEAVE_APPLY_SELF',
      'FEEDBACK_SUBMIT',
      'NOTIFICATION_READ',
    ]),

    STUDENT: new Set<RbacPermission>([
      'COURSE_REGISTER',
      'ADD_DROP_COURSE',
      'ATTENDANCE_VIEW_SELF',
      'LEAVE_APPLY_SELF',
      'FEE_PAY',
      'FEE_VIEW',
      'GRIEVANCE_FILE',
      'FEEDBACK_SUBMIT',
      'NOTIFICATION_READ',
    ]),

    PARENT: new Set<RbacPermission>([
      'ATTENDANCE_VIEW_WARD',
      'LEAVE_APPLY_WARD',
      'FEE_PAY',
      'FEE_VIEW',
      'NOTIFICATION_READ',
    ]),

    COE: new Set<RbacPermission>([
      'SEATING_GENERATE',
      'OSV_EVALUATE',
      'OSV_ARBITRATE',
      'GRADE_LOCK',
      'GRADE_PUBLISH',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    FINANCE_OFFICER: new Set<RbacPermission>([
      'FEE_COLLECT',
      'FEE_RECONCILE',
      'FEE_VIEW',
      'LIBRARY_FINE_COLLECT',
      'NOTIFICATION_READ',
    ]),

    LIBRARIAN: new Set<RbacPermission>([
      'LIBRARY_CIRCULATE',
      'LIBRARY_CATALOG_MANAGE',
      'LIBRARY_FINE_COLLECT',
      'NOTIFICATION_READ',
    ]),

    WARDEN: new Set<RbacPermission>([
      'ATTENDANCE_VIEW_ALL',
      'GRIEVANCE_INVESTIGATE',
      'NOTIFICATION_BROADCAST',
      'NOTIFICATION_READ',
    ]),

    MENTOR: new Set<RbacPermission>([
      'ATTENDANCE_VIEW_ALL',
      'LEAVE_APPROVE_MENTOR',
      'GRIEVANCE_FILE',
      'NOTIFICATION_READ',
    ]),
  };

  /**
   * Route Authorization Rules
   */
  private routeRules: RouteRule[] = [
    {
      pathPattern: /^\/api\/courses\/register/,
      allowedRoles: ['STUDENT', 'REGISTRAR', 'SUPER_ADMIN'],
      requiredPermissions: ['COURSE_REGISTER'],
    },
    {
      pathPattern: /^\/api\/courses\/offer/,
      allowedRoles: ['REGISTRAR', 'DEAN', 'HOD', 'SUPER_ADMIN'],
      requiredPermissions: ['COURSE_OFFER'],
    },
    {
      pathPattern: /^\/api\/attendance\/mark/,
      allowedRoles: ['FACULTY', 'SUPER_ADMIN'],
      requiredPermissions: ['ATTENDANCE_MARK'],
    },
    {
      pathPattern: /^\/api\/attendance\/override/,
      allowedRoles: ['FACULTY', 'HOD', 'REGISTRAR', 'SUPER_ADMIN'],
      requiredPermissions: ['ATTENDANCE_OVERRIDE'],
    },
    {
      pathPattern: /^\/api\/grades\/cia/,
      allowedRoles: ['FACULTY', 'HOD', 'SUPER_ADMIN'],
      requiredPermissions: ['GRADE_ENTER'],
    },
    {
      pathPattern: /^\/api\/grades\/publish/,
      allowedRoles: ['COE', 'REGISTRAR', 'SUPER_ADMIN'],
      requiredPermissions: ['GRADE_PUBLISH'],
    },
    {
      pathPattern: /^\/api\/examination\/seating/,
      allowedRoles: ['COE', 'SUPER_ADMIN'],
      requiredPermissions: ['SEATING_GENERATE'],
    },
    {
      pathPattern: /^\/api\/finance\/reconcile/,
      allowedRoles: ['FINANCE_OFFICER', 'SUPER_ADMIN'],
      requiredPermissions: ['FEE_RECONCILE'],
    },
    {
      pathPattern: /^\/api\/library\/circulate/,
      allowedRoles: ['LIBRARIAN', 'SUPER_ADMIN'],
      requiredPermissions: ['LIBRARY_CIRCULATE'],
    },
    {
      pathPattern: /^\/api\/leave\/apply/,
      allowedRoles: ['STUDENT', 'FACULTY', 'PARENT', 'SUPER_ADMIN'],
      requiredPermissions: ['LEAVE_APPLY_SELF', 'LEAVE_APPLY_WARD'],
    },
    {
      pathPattern: /^\/api\/leave\/approve-mentor/,
      allowedRoles: ['MENTOR', 'SUPER_ADMIN'],
      requiredPermissions: ['LEAVE_APPROVE_MENTOR'],
    },
    {
      pathPattern: /^\/api\/leave\/approve-hod/,
      allowedRoles: ['HOD', 'DEAN', 'SUPER_ADMIN'],
      requiredPermissions: ['LEAVE_APPROVE_HOD'],
    },
    {
      pathPattern: /^\/api\/grievances\/file/,
      allowedRoles: ['STUDENT', 'FACULTY', 'PARENT', 'MENTOR', 'SUPER_ADMIN'],
      requiredPermissions: ['GRIEVANCE_FILE'],
    },
    {
      pathPattern: /^\/api\/grievances\/investigate/,
      allowedRoles: ['DEAN', 'HOD', 'WARDEN', 'SUPER_ADMIN'],
      requiredPermissions: ['GRIEVANCE_INVESTIGATE'],
    },
    {
      pathPattern: /^\/api\/guardians\/link/,
      allowedRoles: ['REGISTRAR', 'SUPER_ADMIN'],
      requiredPermissions: ['GUARDIAN_LINK_MANAGE'],
    },
    {
      pathPattern: /^\/api\/calendar\/manage/,
      allowedRoles: ['REGISTRAR', 'DEAN', 'SUPER_ADMIN'],
      requiredPermissions: ['CALENDAR_MANAGE'],
    },
    {
      pathPattern: /^\/api\/notifications\/broadcast/,
      allowedRoles: ['SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD', 'COE', 'WARDEN'],
      requiredPermissions: ['NOTIFICATION_BROADCAST'],
    },
    {
      pathPattern: /^\/api\/feedback\/surveys/,
      allowedRoles: ['REGISTRAR', 'DEAN', 'HOD', 'SUPER_ADMIN'],
      requiredPermissions: ['FEEDBACK_ANALYZE'],
    },
    {
      pathPattern: /^\/api\/feedback\/submit/,
      allowedRoles: ['STUDENT', 'FACULTY', 'SUPER_ADMIN'],
      requiredPermissions: ['FEEDBACK_SUBMIT'],
    },
    {
      pathPattern: /^\/api\/grievances\/resolve/,
      allowedRoles: ['DEAN', 'SUPER_ADMIN'],
      requiredPermissions: ['GRIEVANCE_RESOLVE'],
    },
    {
      pathPattern: /^\/api\/library\/books/,
      allowedRoles: ['LIBRARIAN', 'SUPER_ADMIN'],
      requiredPermissions: ['LIBRARY_CATALOG_MANAGE'],
    },
    {
      pathPattern: /^\/api\/grades\/lock/,
      allowedRoles: ['COE', 'REGISTRAR', 'DEAN', 'SUPER_ADMIN'],
      requiredPermissions: ['GRADE_LOCK'],
    },
  ];

  /**
   * Check if role has a specific permission
   */
  hasPermission(role: UserRole, permission: RbacPermission): boolean {
    const permissions = this.rolePermissionsMap[role];
    return permissions ? permissions.has(permission) : false;
  }

  /**
   * Check if user role is in allowed roles list
   */
  requireRoles(allowedRoles: UserRole[], userRole: UserRole): boolean {
    return userRole === 'SUPER_ADMIN' || allowedRoles.includes(userRole);
  }

  /**
   * Authorize a route path for a given institutional role
   */
  authorizeRoute(role: UserRole, path: string, method?: string): RbacAuthResult {
    // 1. Super Admin bypass
    if (role === 'SUPER_ADMIN') {
      return { authorized: true, role };
    }

    // 2. Find matching route rule
    const rule = this.routeRules.find((r) => r.pathPattern.test(path));
    if (!rule) {
      // Unrestricted / default authenticated route
      return { authorized: true, role };
    }

    // 3. Verify role
    if (!rule.allowedRoles.includes(role)) {
      return {
        authorized: false,
        role,
        reason: `FORBIDDEN_ROLE: Role ${role} is not permitted to access ${path}`,
      };
    }

    // 4. Verify permissions (any of requiredPermissions for multi-permission endpoints)
    const hasRequiredPermission = rule.requiredPermissions.some((perm) => this.hasPermission(role, perm));
    if (!hasRequiredPermission) {
      return {
        authorized: false,
        role,
        reason: `INSUFFICIENT_PERMISSIONS: Role ${role} lacks required permissions [${rule.requiredPermissions.join(', ')}]`,
      };
    }

    return { authorized: true, role };
  }

  /**
   * Get all permissions assigned to a role
   */
  getRolePermissions(role: UserRole): RbacPermission[] {
    const permissions = this.rolePermissionsMap[role];
    return permissions ? Array.from(permissions) : [];
  }

  /**
   * Validate if a string is a valid institutional role
   */
  isInstitutionalRole(role: string): role is UserRole {
    return ALL_INSTITUTIONAL_ROLES.includes(role as UserRole);
  }
}

export const rbacGuard = new RbacGuard();
