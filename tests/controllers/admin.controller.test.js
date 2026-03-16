import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---
const mockGetDashboardKPIs = jest.fn();
const mockFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockClientFindMany = jest.fn();
const mockClientFindFirst = jest.fn();
const mockClientUpdate = jest.fn();
const mockLoanFindMany = jest.fn();
const mockLoanFindFirst = jest.fn();
const mockRouteFindMany = jest.fn();
const mockIncidentFindMany = jest.fn();
const mockPaymentScheduleFindMany = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockPaymentCount = jest.fn();
const mockBcryptCompare = jest.fn();

jest.unstable_mockModule('../../src/services/admin.service.js', () => ({
  getDashboardKPIs: mockGetDashboardKPIs,
}));

jest.unstable_mockModule('../../src/utils/asyncHandler.js', () => ({
  default: (fn) => fn,
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    user: { findUnique: mockFindUnique, findMany: mockUserFindMany },
    client: {
      findMany: mockClientFindMany,
      findFirst: mockClientFindFirst,
      update: mockClientUpdate,
    },
    loan: { findMany: mockLoanFindMany, findFirst: mockLoanFindFirst },
    route: { findMany: mockRouteFindMany },
    incident: { findMany: mockIncidentFindMany },
    paymentSchedule: { findMany: mockPaymentScheduleFindMany },
    payment: { findMany: mockPaymentFindMany, count: mockPaymentCount },
  },
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: mockBcryptCompare },
}));

const {
  getLogin,
  postLogin,
  getDashboard,
  getLoans,
  getNewLoan,
  createLoan,
  getLoan,
  getClients,
  getClient,
  restrictClient,
  getCollectors,
  getRoutes,
  getReports,
  getPayments,
  getSettings,
} = await import('../../src/controllers/admin.controller.js');

// --- Fixtures ---
const ORG_ID = 'org-550e8400-e29b-41d4-a716-446655440000';

const sampleKPIs = {
  activeLoans: 15,
  totalClients: 42,
  totalCollectors: 5,
  totalDisbursed: '5000000.00',
  totalCollected: '1500000.00',
  totalOutstanding: '3500000.00',
  totalMora: '250000.00',
  todayCollected: '120000.00',
  todayPayments: 5,
  overdueSchedules: 8,
  moraAlerts: [],
  recentPayments: [],
};

// --- Helpers ---
const createReq = (overrides = {}) => ({
  user: {
    id: 'user-001',
    firstName: 'Admin',
    lastName: 'Test',
    role: 'ADMIN',
    organizationId: ORG_ID,
    ...overrides.user,
  },
  ...overrides,
});

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.render = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDashboardKPIs.mockResolvedValue(sampleKPIs);
  });

  it('llama a getDashboardKPIs con el organizationId del usuario', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    expect(mockGetDashboardKPIs).toHaveBeenCalledWith(ORG_ID);
  });

  it('renderiza pages/dashboard con los datos correctos', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    expect(res.render).toHaveBeenCalledWith('pages/dashboard', {
      title: 'Dashboard',
      user: req.user,
      kpis: sampleKPIs,
      currentPath: '/admin/dashboard',
    });
  });

  it('pasa el objeto user completo a la vista', async () => {
    const req = createReq({
      user: { firstName: 'Jorge', role: 'SUPER_ADMIN', organizationId: ORG_ID },
    });
    const res = createRes();

    await getDashboard(req, res);

    const renderCall = res.render.mock.calls[0][1];
    expect(renderCall.user.firstName).toBe('Jorge');
    expect(renderCall.user.role).toBe('SUPER_ADMIN');
  });

  it('propaga el error si getDashboardKPIs falla', async () => {
    const dbError = new Error('Connection failed');
    mockGetDashboardKPIs.mockRejectedValue(dbError);

    const req = createReq();
    const res = createRes();

    await expect(getDashboard(req, res)).rejects.toThrow('Connection failed');
  });

  it('llama a render exactamente una vez', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    expect(res.render).toHaveBeenCalledTimes(1);
  });

  it('usa pages/dashboard como nombre de vista', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    const viewName = res.render.mock.calls[0][0];
    expect(viewName).toBe('pages/dashboard');
  });

  it('establece currentPath como /admin/dashboard', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    const renderData = res.render.mock.calls[0][1];
    expect(renderData.currentPath).toBe('/admin/dashboard');
  });

  it('establece title como Dashboard', async () => {
    const req = createReq();
    const res = createRes();

    await getDashboard(req, res);

    const renderData = res.render.mock.calls[0][1];
    expect(renderData.title).toBe('Dashboard');
  });
});

// ============================================
// getLogin
// ============================================
describe('getLogin', () => {
  it('renderiza pages/login con title y currentPath', () => {
    const req = { session: {} };
    const res = createRes();

    getLogin(req, res);

    expect(res.render).toHaveBeenCalledWith('pages/login', {
      title: 'Iniciar Sesión',
      currentPath: '/admin/login',
      flashError: undefined,
      flashSucess: undefined,
    });
  });

  it('pasa flashError de la sesión y lo elimina', () => {
    const req = { session: { flashError: 'Credenciales inválidas' } };
    const res = createRes();

    getLogin(req, res);

    const renderData = res.render.mock.calls[0][1];
    expect(renderData.flashError).toBe('Credenciales inválidas');
    expect(req.session.flashError).toBeUndefined();
  });

  it('pasa flashSucess de la sesión y lo elimina', () => {
    const req = { session: { flashSucess: 'Sesión cerrada' } };
    const res = createRes();

    getLogin(req, res);

    const renderData = res.render.mock.calls[0][1];
    expect(renderData.flashSucess).toBe('Sesión cerrada');
    expect(req.session.flashSucess).toBeUndefined();
  });
});

// ============================================
// postLogin
// ============================================
describe('postLogin', () => {
  const createLoginReq = (overrides = {}) => ({
    body: { email: 'admin@test.com', password: 'secret123' },
    session: { save: jest.fn((cb) => cb()) },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirige a /admin/dashboard con credenciales válidas', async () => {
    const dbUser = {
      id: 'user-001',
      organizationId: 'org-001',
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'Test',
      email: 'admin@test.com',
      isActive: true,
      passwordHash: '$2b$10$hash',
    };
    mockFindUnique.mockResolvedValue(dbUser);
    mockBcryptCompare.mockResolvedValue(true);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/dashboard');
    expect(req.session.user).toEqual({
      id: 'user-001',
      organizationId: 'org-001',
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'Test',
      email: 'admin@test.com',
      isActive: true,
    });
  });

  it('redirige a /admin/login con credenciales inválidas', async () => {
    mockFindUnique.mockResolvedValue(undefined);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
    expect(req.session.flashError).toBe('Credenciales inválidas');
  });

  it('redirige a /admin/login cuando la contraseña no coincide', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u-1', passwordHash: '$hash' });
    mockBcryptCompare.mockResolvedValue(false);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
    expect(req.session.flashError).toBe('Credenciales inválidas');
  });

  it('redirige a /admin/login si la cuenta está desactivada', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u-1',
      isActive: false,
      passwordHash: '$hash',
    });
    mockBcryptCompare.mockResolvedValue(true);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
    expect(req.session.flashError).toBe('Cuenta desactivada. Contacte al administrador');
  });

  it('redirige a /admin/login si el rol no es ADMIN o SUPER_ADMIN', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u-1',
      isActive: true,
      role: 'COLLECTOR',
      passwordHash: '$hash',
    });
    mockBcryptCompare.mockResolvedValue(true);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
    expect(req.session.flashError).toBe('Acceso denegado. Solo administradores');
  });

  it('no incluye passwordHash en la sesión', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u-1',
      organizationId: 'org-1',
      role: 'ADMIN',
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      isActive: true,
      passwordHash: '$2b$10$secret',
    });
    mockBcryptCompare.mockResolvedValue(true);

    const req = createLoginReq();
    const res = createRes();

    await postLogin(req, res);

    expect(req.session.user.passwordHash).toBeUndefined();
  });
});

// ============================================
// getLoans
// ============================================
describe('getLoans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoanFindMany.mockResolvedValue([]);
  });

  it('renderiza pages/loans/index con lista vacía y sin filtros', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getLoans(req, res);

    expect(mockLoanFindMany).toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/index',
      expect.objectContaining({
        title: 'Préstamos',
        user: req.user,
        currentPath: '/admin/loans',
        loans: [],
        search: '',
        status: '',
      }),
    );
  });

  it('filtra por status cuando se provee el parámetro', async () => {
    const req = createReq({ query: { status: 'ACTIVE' }, session: {} });
    const res = createRes();

    await getLoans(req, res);

    const callArgs = mockLoanFindMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('ACTIVE');
    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/index',
      expect.objectContaining({
        status: 'ACTIVE',
      }),
    );
  });

  it('filtra por nombre de cliente cuando se provee search', async () => {
    const req = createReq({ query: { search: 'García' }, session: {} });
    const res = createRes();

    await getLoans(req, res);

    const callArgs = mockLoanFindMany.mock.calls[0][0];
    expect(callArgs.where.client).toBeDefined();
    expect(callArgs.where.client.OR).toHaveLength(2);
    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/index',
      expect.objectContaining({
        search: 'García',
      }),
    );
  });

  it('renderiza los préstamos retornados por Prisma', async () => {
    const fakeLoan = {
      id: 'loan-uuid-1',
      status: 'ACTIVE',
      principalAmount: '500000',
      totalAmount: '600000',
      installmentAmount: '20000',
      outstandingBalance: '480000',
      numberOfPayments: 30,
      paidPayments: 1,
      disbursementDate: new Date('2024-01-15'),
      paymentFrequency: 'DAILY',
      client: { firstName: 'Ana', lastName: 'Gómez' },
      collector: { firstName: 'Juan', lastName: 'Pérez' },
    };
    mockLoanFindMany.mockResolvedValue([fakeLoan]);

    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getLoans(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/index',
      expect.objectContaining({
        loans: [fakeLoan],
      }),
    );
  });
});

// ============================================
// getNewLoan
// ============================================
describe('getNewLoan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientFindMany.mockResolvedValue([]);
    mockRouteFindMany.mockResolvedValue([]);
  });

  it('renderiza pages/loans/new con clients y routes', async () => {
    const sampleClients = [
      { id: 'c-1', firstName: 'Ana', lastName: 'Gómez', documentNumber: '123' },
    ];
    const sampleRoutes = [{ id: 'r-1', name: 'Ruta Norte' }];
    mockClientFindMany.mockResolvedValue(sampleClients);
    mockRouteFindMany.mockResolvedValue(sampleRoutes);

    const req = createReq({ session: {} });
    const res = createRes();

    await getNewLoan(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/new',
      expect.objectContaining({
        title: 'Nuevo Préstamo',
        user: req.user,
        currentPath: '/admin/loans/new',
        clients: sampleClients,
        routes: sampleRoutes,
      }),
    );
  });

  it('renderiza con listas vacías si no hay clientes ni rutas', async () => {
    const req = createReq({ session: {} });
    const res = createRes();

    await getNewLoan(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/new',
      expect.objectContaining({
        clients: [],
        routes: [],
      }),
    );
  });
});

// ============================================
// createLoan
// ============================================
describe('createLoan', () => {
  it('establece flashSucess y redirige a /admin/loans', async () => {
    const req = createReq({ session: {} });
    const res = createRes();

    await createLoan(req, res);

    expect(req.session.flashSucess).toBe('Préstamo creado exitosamente');
    expect(res.redirect).toHaveBeenCalledWith('/admin/loans');
  });
});

// ============================================
// ============================================
// getLoan
// ============================================
describe('getLoan', () => {
  const fakeLoan = {
    id: 'loan-999',
    status: 'ACTIVE',
    principalAmount: '500000',
    totalAmount: '600000',
    installmentAmount: '20000',
    outstandingBalance: '480000',
    totalPaid: '20000',
    moraAmount: '0',
    interestRate: '0.05',
    numberOfPayments: 30,
    paidPayments: 1,
    disbursementDate: new Date('2024-01-15'),
    expectedEndDate: new Date('2024-02-15'),
    actualEndDate: null,
    amortizationType: 'FIXED',
    paymentFrequency: 'DAILY',
    notes: null,
    organizationId: 'org-550e8400-e29b-41d4-a716-446655440000',
    client: {
      id: 'client-001',
      firstName: 'Ana',
      lastName: 'Gómez',
      documentType: 'CC',
      documentNumber: '123456',
      phone: '3001111111',
      address: 'Calle 1',
      businessName: null,
      isActive: true,
      route: null,
    },
    collector: { id: 'user-001', firstName: 'Juan', lastName: 'Pérez', phone: null },
    paymentSchedule: [],
    payments: [],
    incidents: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza pages/loans/detail con los datos del préstamo', async () => {
    mockLoanFindFirst.mockResolvedValue(fakeLoan);
    const req = createReq({ params: { id: 'loan-999' }, session: {} });
    const res = createRes();

    await getLoan(req, res);

    expect(mockLoanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loan-999', organizationId: req.user.organizationId },
      }),
    );
    expect(res.render).toHaveBeenCalledWith(
      'pages/loans/detail',
      expect.objectContaining({
        loan: fakeLoan,
        currentPath: '/admin/loans/loan-999',
      }),
    );
  });

  it('lanza error 404 si el préstamo no existe', async () => {
    mockLoanFindFirst.mockResolvedValue(null);
    const req = createReq({ params: { id: 'loan-no-existe' }, session: {} });
    const res = createRes();

    await expect(getLoan(req, res)).rejects.toMatchObject({ status: 404 });
  });
});

// ============================================
// getClients
// ============================================
describe('getClients', () => {
  const sampleClients = [
    {
      id: 'client-001',
      firstName: 'Ana',
      lastName: 'García',
      documentType: 'CC',
      documentNumber: '123456',
      phone: '3001234567',
      address: 'Calle 1',
      businessName: undefined,
      isActive: true,
      createdAt: new Date('2025-01-01'),
      _count: { loans: 2 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientFindMany.mockResolvedValue(sampleClients);
  });

  it('renderiza pages/clients/index con la lista de clientes', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getClients(req, res);

    expect(mockClientFindMany).toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith(
      'pages/clients/index',
      expect.objectContaining({
        title: 'Clientes',
        currentPath: '/admin/clients',
        clients: sampleClients,
        search: '',
      }),
    );
  });

  it('aplica filtro de búsqueda cuando se pasa ?search=', async () => {
    const req = createReq({ query: { search: 'Ana' }, session: {} });
    const res = createRes();

    await getClients(req, res);

    const whereArg = mockClientFindMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(res.render).toHaveBeenCalledWith(
      'pages/clients/index',
      expect.objectContaining({ search: 'Ana' }),
    );
  });

  it('propaga error si Prisma falla', async () => {
    mockClientFindMany.mockRejectedValue(new Error('DB error'));
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await expect(getClients(req, res)).rejects.toThrow('DB error');
  });
});

// ============================================
// getClient
// ============================================
describe('getClient', () => {
  const sampleClient = {
    id: 'client-456',
    firstName: 'Pedro',
    lastName: 'Pérez',
    documentType: 'CC',
    documentNumber: '654321',
    phone: '3109876543',
    address: 'Carrera 5',
    businessName: undefined,
    businessAddress: undefined,
    notes: undefined,
    isActive: true,
    createdAt: new Date('2025-02-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientFindFirst.mockResolvedValue(sampleClient);
    mockLoanFindMany.mockResolvedValue([]);
    mockIncidentFindMany.mockResolvedValue([]);
  });

  it('renderiza pages/clients/detail con datos del cliente', async () => {
    const req = createReq({ params: { id: 'client-456' }, session: {} });
    const res = createRes();

    await getClient(req, res);

    expect(mockClientFindFirst).toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith(
      'pages/clients/detail',
      expect.objectContaining({
        client: sampleClient,
        loans: [],
        incidents: [],
        currentPath: '/admin/clients',
      }),
    );
  });

  it('lanza 404 si el cliente no existe', async () => {
    mockClientFindFirst.mockResolvedValue(undefined);
    const req = createReq({ params: { id: 'no-existe' }, session: {} });
    const res = createRes();

    await expect(getClient(req, res)).rejects.toThrow('Cliente no encontrado');
  });
});

// ============================================
// restrictClient
// ============================================
describe('restrictClient', () => {
  const activeClient = {
    id: 'client-456',
    firstName: 'Pedro',
    lastName: 'Pérez',
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientFindFirst.mockResolvedValue(activeClient);
    mockClientUpdate.mockResolvedValue({ ...activeClient, isActive: false });
  });

  it('actualiza isActive a false y redirige al detalle', async () => {
    const req = createReq({ params: { id: 'client-456' }, session: {} });
    const res = createRes();

    await restrictClient(req, res);

    expect(mockClientUpdate).toHaveBeenCalledWith({
      where: { id: 'client-456' },
      data: { isActive: false },
    });
    expect(req.session.flashSucess).toContain('restringido');
    expect(res.redirect).toHaveBeenCalledWith('/admin/clients/client-456');
  });

  it('activa el cliente si estaba restringido', async () => {
    mockClientFindFirst.mockResolvedValue({ ...activeClient, isActive: false });
    const req = createReq({ params: { id: 'client-456' }, session: {} });
    const res = createRes();

    await restrictClient(req, res);

    expect(mockClientUpdate).toHaveBeenCalledWith({
      where: { id: 'client-456' },
      data: { isActive: true },
    });
    expect(req.session.flashSucess).toContain('reactivado');
  });

  it('lanza 404 si el cliente no existe', async () => {
    mockClientFindFirst.mockResolvedValue(undefined);
    const req = createReq({ params: { id: 'no-existe' }, session: {} });
    const res = createRes();

    await expect(restrictClient(req, res)).rejects.toThrow('Cliente no encontrado');
  });
});

// ============================================
// getCollectors
// ============================================
describe('getCollectors', () => {
  const sampleCollectors = [
    {
      id: 'col-001',
      firstName: 'Carlos',
      lastName: 'Gómez',
      phone: '3001234567',
      email: 'carlos@elpaisa.com',
      isActive: true,
      lastLoginAt: new Date('2025-01-10'),
      routes: [{ id: 'route-001', name: 'Zona Norte' }],
      payments: [{ totalReceived: '50000.00' }, { totalReceived: '75000.00' }],
    },
    {
      id: 'col-002',
      firstName: 'Andrés',
      lastName: 'López',
      phone: '3109876543',
      email: 'andres@elpaisa.com',
      isActive: false,
      lastLoginAt: null,
      routes: [],
      payments: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockResolvedValue(sampleCollectors);
  });

  it('consulta los cobradores de la organización con sus rutas y pagos del día', async () => {
    const req = createReq();
    const res = createRes();

    await getCollectors(req, res);

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          role: 'COLLECTOR',
        }),
        select: expect.objectContaining({
          id: true,
          firstName: true,
          lastName: true,
          routes: expect.any(Object),
          payments: expect.any(Object),
        }),
      }),
    );
  });

  it('renderiza pages/collectors/index con los cobradores', async () => {
    const req = createReq();
    const res = createRes();

    await getCollectors(req, res);

    expect(res.render).toHaveBeenCalledWith('pages/collectors/index', {
      title: 'Cobradores',
      user: req.user,
      currentPath: '/admin/collectors',
      collectors: sampleCollectors,
    });
  });
});

// ============================================
// getRoutes
// ============================================
describe('getRoutes', () => {
  const sampleRoutes = [
    {
      id: 'route-001',
      name: 'Zona Norte',
      description: 'Barrio La Esperanza',
      isActive: true,
      collector: { id: 'col-001', firstName: 'Carlos', lastName: 'López' },
      _count: { clients: 12 },
    },
    {
      id: 'route-002',
      name: 'Zona Sur',
      description: null,
      isActive: false,
      collector: null,
      _count: { clients: 0 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteFindMany.mockResolvedValue(sampleRoutes);
  });

  it('consulta route.findMany filtrando por organizationId', async () => {
    const req = createReq({ session: {} });
    const res = createRes();

    await getRoutes(req, res);

    expect(mockRouteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
        select: expect.objectContaining({
          id: true,
          name: true,
          isActive: true,
          collector: expect.any(Object),
          _count: expect.any(Object),
        }),
      }),
    );
  });

  it('renderiza pages/routes/index con las rutas y datos correctos', async () => {
    const req = createReq({ session: {} });
    const res = createRes();

    await getRoutes(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/routes/index',
      expect.objectContaining({
        title: 'Rutas',
        user: req.user,
        currentPath: '/admin/routes',
        routes: sampleRoutes,
      }),
    );
  });

  it('renderiza con lista vacía cuando no hay rutas', async () => {
    mockRouteFindMany.mockResolvedValue([]);
    const req = createReq({ session: {} });
    const res = createRes();

    await getRoutes(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/routes/index',
      expect.objectContaining({
        routes: [],
      }),
    );
  });
});

// ============================================
// getReports
// ============================================
describe('getReports', () => {
  const samplePortfolio = [
    {
      id: 'sched-001',
      dueDate: new Date('2025-02-23'),
      amountDue: '80000.00',
      amountPaid: '0.00',
      loan: {
        id: 'loan-001',
        status: 'ACTIVE',
        outstandingBalance: '500000.00',
        moraAmount: '0.00',
        client: { firstName: 'Juan', lastName: 'Pérez', phone: '3001234567' },
        collector: { firstName: 'Carlos', lastName: 'Gómez' },
      },
    },
  ];
  const sampleRoutes = [
    { id: 'route-001', name: 'Zona Norte' },
    { id: 'route-002', name: 'Zona Sur' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentScheduleFindMany.mockResolvedValue(samplePortfolio);
    mockRouteFindMany.mockResolvedValue(sampleRoutes);
  });

  it('consulta paymentSchedule y routes con Promise.all', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getReports(req, res);

    expect(mockPaymentScheduleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loan: expect.objectContaining({ organizationId: ORG_ID }),
        }),
        take: 200,
      }),
    );
    expect(mockRouteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID, isActive: true }),
      }),
    );
  });

  it('renderiza pages/reports/index con portfolio, routes y filters', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getReports(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/reports/index',
      expect.objectContaining({
        title: 'Reportes',
        user: req.user,
        currentPath: '/admin/reports',
        portfolio: samplePortfolio,
        routes: sampleRoutes,
        filters: { dateFrom: '', dateTo: '', routeId: '' },
      }),
    );
  });

  it('aplica filtros de fecha y ruta cuando se pasan como query params', async () => {
    const req = createReq({
      query: { dateFrom: '2025-02-01', dateTo: '2025-02-28', routeId: 'route-001' },
      session: {},
    });
    const res = createRes();

    await getReports(req, res);

    expect(mockPaymentScheduleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loan: expect.objectContaining({
            collector: { routes: { some: { id: 'route-001' } } },
          }),
        }),
      }),
    );
    expect(res.render).toHaveBeenCalledWith(
      'pages/reports/index',
      expect.objectContaining({
        filters: { dateFrom: '2025-02-01', dateTo: '2025-02-28', routeId: 'route-001' },
      }),
    );
  });
});

// ============================================
// getPayments
// ============================================
describe('getPayments', () => {
  const samplePayments = [
    {
      id: 'pay-001',
      amount: '50000.00',
      moraAmount: '2000.00',
      totalReceived: '52000.00',
      paymentMethod: 'CASH',
      telegramSent: true,
      notes: null,
      collectedAt: new Date('2025-06-01T10:00:00Z'),
      loan: { id: 'loan-001', client: { firstName: 'Pedro', lastName: 'Pérez' } },
      collector: { firstName: 'Carlos', lastName: 'López' },
    },
  ];
  const sampleCollectors = [{ id: 'col-001', firstName: 'Carlos', lastName: 'López' }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentFindMany.mockResolvedValue(samplePayments);
    mockPaymentCount.mockResolvedValue(1);
    mockUserFindMany.mockResolvedValue(sampleCollectors);
  });

  it('consulta payment.findMany, payment.count y user.findMany con Promise.all', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getPayments(req, res);

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loan: expect.objectContaining({ organizationId: ORG_ID }),
        }),
        take: 25,
        skip: 0,
      }),
    );
    expect(mockPaymentCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loan: expect.objectContaining({ organizationId: ORG_ID }),
        }),
      }),
    );
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          role: 'COLLECTOR',
          isActive: true,
        }),
      }),
    );
  });

  it('renderiza pages/payments/index con los datos correctos', async () => {
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getPayments(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/payments/index',
      expect.objectContaining({
        title: 'Pagos',
        user: req.user,
        currentPath: '/admin/payments',
        payments: samplePayments,
        collectors: sampleCollectors,
        total: 1,
        page: 1,
        totalPages: 1,
        filters: { dateFrom: '', dateTo: '', collectorId: '', paymentMethod: '' },
      }),
    );
  });

  it('aplica filtros de collectorId y paymentMethod cuando se pasan como query params', async () => {
    const req = createReq({
      query: { collectorId: 'col-001', paymentMethod: 'CASH', page: '2' },
      session: {},
    });
    const res = createRes();

    await getPayments(req, res);

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collectorId: 'col-001',
          paymentMethod: 'CASH',
        }),
        skip: 25,
        take: 25,
      }),
    );
    expect(res.render).toHaveBeenCalledWith(
      'pages/payments/index',
      expect.objectContaining({
        page: 2,
        filters: expect.objectContaining({ collectorId: 'col-001', paymentMethod: 'CASH' }),
      }),
    );
  });

  it('calcula correctamente totalPages con múltiples páginas', async () => {
    mockPaymentCount.mockResolvedValue(75);
    const req = createReq({ query: {}, session: {} });
    const res = createRes();

    await getPayments(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'pages/payments/index',
      expect.objectContaining({
        total: 75,
        totalPages: 3,
      }),
    );
  });
});

// ============================================
// getSettings
// ============================================
describe('getSettings', () => {
  it('renderiza pages/settings con los datos correctos', async () => {
    const req = createReq();
    const res = createRes();

    await getSettings(req, res);

    expect(res.render).toHaveBeenCalledWith('pages/settings', {
      title: 'Configuración',
      user: req.user,
      currentPath: '/admin/settings',
    });
  });
});
